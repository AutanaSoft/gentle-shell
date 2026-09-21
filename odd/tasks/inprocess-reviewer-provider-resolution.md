# In-Process Reviewer: Provider Resolution Through the Composed Provider

## Objective

Fix the live defect reported as #1304: a reviewer lens routed to an extension-registered provider
(`claude-bridge/*`) can never complete, because `runInProcessReviewer` dispatches through pi-ai's
`completeSimple`, which resolves against pi-ai's builtin-only `apiProviderRegistry` instead of pi's
composed provider. RDD is unusable for every user whose models come from a pi extension.

This closes #1304, #1190, #757 and #831 — four reports of the same root cause across two different
transports.

## Problem

`lib/inprocess-reviewer.ts:250` completes through the injected `deps.complete`, typed as pi-ai's
`completeSimple` (`:20`, `:79`). The registry seam (`:31-37`) exposes only `find` and
`getApiKeyAndHeaders`, so the composition layer is never consulted.

pi-ai `dist/compat.js` then resolves the call against its own module-level registry:

```
streamSimple(model, ...)
  -> getBuiltinProviderForModel(model)   // undefined: claude-bridge is not builtin
  -> resolveApiProvider(model.api)
       -> getApiProvider(api)            // reads apiProviderRegistry (registerApiProvider only)
       -> throw `No API provider registered for api: ${api}`   // compat.js:165
```

Two registries never meet:

| Registry | Populated by | Read by |
| --- | --- | --- |
| pi `ModelRegistry` composed provider | `pi.registerProvider` (extensions) | the interactive agent loop |
| pi-ai `apiProviderRegistry` | `registerApiProvider` (builtins only) | `completeSimple` |

The throw is synchronous, which is why the reported failure carries `elapsed_ms: 1` and
`exit_code: null` — no network, no auth attempt.

The composed provider does honor extensions
(`@earendil-works/pi-coding-agent/dist/core/provider-composer.js:316`:
`if (extension?.streamSimple && model.api === extension.api)`), and the real object already passed as
`reviewerRegistry` at `extensions/gentle-ai.ts:8888` and `:8931` is `ctx.modelRegistry`, which exposes
`getProvider(provider): Provider | undefined`
(`dist/core/model-registry.d.ts:32`, present in 0.85.1). Only the narrowed TypeScript interface hides it.

The provider side cannot fix this: `pi-claude-bridge` 0.8.0 registers through `pi.registerProvider`,
which is exactly what an extension provider is supposed to do.

### This is a design bug, not a slip

The module header at `lib/inprocess-reviewer.ts:3-7` states that the child transport it replaced
"dropped extension-registered providers", and `odd/tasks/inprocess-reviewer-completion.md` names
extension-registered providers in both its objective and its acceptance criterion. The acceptance
test passed only because the fake registry had no composition layer. The chosen primitive,
`completeSimple`, is structurally incapable of reaching an extension provider.

The header phrase "no extension hooks" (`:12`) means no tool/skill/prompt hooks. It was read as
"no extension providers". That misreading is the origin of the defect and must be corrected in place.

## Constraints

- Strict behavioral TDD: a focused failing test precedes every behavior change.
- Peer floor stays `>=0.85.1`. `ModelRegistry.getProvider` exists on 0.85.1; `ModelRegistry.streamSimple`
  is 0.86.1-only and is therefore forbidden here.
- `ModelRegistry.complete()` is forbidden: it routes through the full `ApiStreamOptions` path and
  resolves auth itself, which would silently bypass the `AUTH_UNAVAILABLE` typed refusal.
- All ten `INPROCESS_REVIEWER_FAILURE` codes (`:39-50`) keep their current semantics and evidence.
- Abort classification stays signal-based (`abortRefusal`, `:238-246`) on both settlement paths.
- `getApiKeyAndHeaders` stays: the composed provider forwards `options` verbatim and resolves no
  credentials.
- The existing 30 tests in `tests/inprocess-reviewer.test.ts` and the maintainer matrix must keep
  passing without structural rewrites.
- No secret logged, rendered or persisted. No new network call.
- No delivery action (push, PR) without an explicit user decision.

## Authorized edit surfaces

- `odd/tasks/inprocess-reviewer-provider-resolution.md`
- `lib/inprocess-reviewer.ts`
- `lib/review-host-relay.ts`
- `tests/inprocess-reviewer.test.ts`
- `docs/review-integration.md` (only if wording requires it; the file is byte-pinned in
  `scripts/verify-package-files.mjs` and its hash must be re-pinned when touched)

Out of scope for this change: `extensions/gentle-ai.ts` (no change expected — the widened interface
stops hiding a method the real object already has), `ResolvedRequestAuth.baseUrl` being dropped by the
narrow seam (pre-existing, follow-up issue).

## Decisions

- **Optional `getProvider` on the seam, with fallback to `deps.complete`.** A required method would
  break all 30 existing tests and the `registerFauxProvider`-based maintainer matrix, which injects
  into compat's registry and would be invisible to a composed-provider path.
- **Complete via `provider.streamSimple(model, context, options).result()`.** `SimpleStreamOptions`
  is identical between both paths; only the return type differs (stream vs promise). `.result()` is
  exactly what compat itself does, and it preserves both settlement conventions the module already
  handles.
- **Incoherence guard.** When `registry.getProvider` exists but returns `undefined` for a model
  `find()` just resolved, that combination is incoherent and must refuse, not fall back silently.
  The fallback is reserved for "the seam has no `getProvider` at all", i.e. test doubles.
- **Env-API-key delta is a real risk, not a theoretical one.** compat wraps every dispatch in
  `withEnvApiKey(model, options)`; `provider.streamSimple` does not. A builtin provider authenticated
  purely by an env var with no stored credential is rescued by compat today and would not be after
  this change. It gets its own test.

## Tasks

- [x] IRP-0 — Sanitize the local pi install so an e2e check is meaningful: `~/.pi/agent/npm/package.json`
      pins `gentle-pi` to a `file:` tarball that no longer exists, and the installed build is stock
      3.2.1 (subprocess relay, `--no-extensions`, no allowlist). Record the resulting versions.
- [ ] IRP-1 — RED: a focused failing test asserting that a registry exposing `getProvider` routes the
      completion through the returned provider's `streamSimple`, with the extension `api` reaching it,
      and that `deps.complete` is never called.
- [ ] IRP-2 — GREEN: widen `InProcessReviewerRegistry` with optional `getProvider`, dispatch through
      `provider.streamSimple(...).result()`, keep `deps.complete` as the no-`getProvider` fallback.
- [ ] IRP-3 — RED/GREEN: the incoherence guard (`getProvider` present, returns `undefined` for a
      resolved model) refuses with a typed code instead of falling back.
- [ ] IRP-4 — RED/GREEN: lock the env-API-key behavior for a provider with no stored credential, so
      the `withEnvApiKey` delta is a decision on record rather than a silent regression.
- [ ] IRP-5 — Correct the module header: "Only `find` and `getApiKeyAndHeaders` are needed here"
      (`:25-26`) is now false, and "no extension hooks" (`:12`) must state that it excludes
      tool/skill/prompt hooks, not extension-registered providers.
- [ ] IRP-6 — Verify: focused tests, `pnpm test`, `pnpm run typecheck`, and the maintainer matrix
      (`pnpm run test:maintainer`) with observed results recorded below.
- [ ] IRP-7 — E2E from pi: a real RDD lens routed to `claude-bridge/*` completes and is admitted.
- [ ] IRP-8 — PR upstream against `Gentleman-Programming/gentle-shell`, linking #1304, #1190, #757,
      #831, and naming the design-bug framing so the failure class does not return through a third door.

## Acceptance criteria

- A lens routed to `claude-bridge/claude-opus-5` completes in-process and is admitted, with no
  `No API provider registered for api: claude-bridge`.
- A registry without `getProvider` still completes through `deps.complete` — existing tests unedited.
- A registry with `getProvider` returning `undefined` for a resolved model refuses with a typed code.
- All ten failure codes keep their current messages and evidence shape.
- `pnpm test`, `pnpm run typecheck` and `pnpm run test:maintainer` pass with no regressions.
- The peer floor stays `>=0.85.1` and nothing references `ModelRegistry.streamSimple`.

## Verification plan

- Focused: `node --experimental-strip-types --test tests/inprocess-reviewer.test.ts`
- Relay: `node --experimental-strip-types --test tests/review-host-relay.test.ts`
- Full: `pnpm test`
- Types: `pnpm run typecheck`
- Maintainer matrix: `pnpm run test:maintainer`
- E2E: new pi session (not `/reload`), RDD lens routed to `claude-bridge/*`.

TDD mode: **on**. Source: this repository's ODD convention (every `odd/tasks/*` document declares
strict behavioral TDD). Runner: `node --experimental-strip-types --test tests/<file>.test.ts` for
focused runs, `pnpm test` for the suite.

## Delivery

Forecast: well under the ~400 authored changed line budget (roughly 15 production lines plus tests and
comment corrections). Strategy `ask-on-risk`; a single PR is expected and no chain is planned. Push and
PR remain the user's decision.

## Progress

- 2026-09-21: Exploration completed and the #1304 hypothesis confirmed against the real code and the
  installed runtime (`@earendil-works/pi-coding-agent` 0.85.1, `@earendil-works/pi-ai` 0.85.1).
  `getProvider` verified present at `dist/core/model-registry.d.ts:32`; `streamSimple` verified absent
  from `ModelRegistry` on 0.85.1. No upstream fix in flight (40 commits reviewed, zero hits).

## Verification evidence

- IRP-0 (2026-09-21): the phantom `file:` pin was replaced with `gentle-pi@^3.3.0` from the registry;
  `npm ls gentle-pi` reports `gentle-pi@3.3.0`. The installed build now carries
  `lib/inprocess-reviewer.ts` and no longer carries `lib/opaque-pi-reviewer-adapter.ts`, so the local
  baseline reproduces **this** defect (#1304, in-process) rather than the superseded
  `--no-extensions` one (#1337). A repository-wide search for `GENTLE_PI_REVIEW_RELAY_EXTENSIONS` and
  `review-relay.json` in the installed package returns nothing, which confirms no escape hatch exists
  on a stock install.
- IRP-0 aligned versions: `gentle-ai` 3.3.0, `gentle-pi` 3.3.0, `pi` 0.85.1,
  `@earendil-works/pi-coding-agent` 0.85.1, `pi-claude-bridge` 0.8.0. `gentle-pi`'s declared peer is
  `@earendil-works/pi-coding-agent >=0.85.1`.
- IRP-0 consequence for the fix: the live runtime is pi-coding-agent **0.85.1**, where
  `ModelRegistry.streamSimple` does not exist. The `getProvider` route is therefore not a portability
  preference, it is the only route this machine can execute — the e2e check in IRP-7 would fail on
  0.86.1-only API.
- IRP-0 leftovers, dead but harmless, kept rather than deleted (they are user configuration, not
  cruft, and deleting them silently would erase evidence of the earlier workaround):
  `~/.pi/gentle-ai/review-relay.json` (nothing in 3.3.0 reads it) and `~/.pi/agent/pi-env.bak` (the
  env var it set is not read in 3.3.0).

## Next step

IRP-1: the RED test locking composed-provider routing for an extension-registered provider.
