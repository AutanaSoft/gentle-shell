# RDD Sidebar Status

- Feature: `rdd-sidebar-status`
- Repository: `gentle-pi`
- Branch: `feat/shell-rdd-status-v2`
- Base: `main` / `upstream/main` at `cf1fdb65c267d9fbdad2c48f6c9e008f3f91d7a3`
- Status: RSS-8 implemented and independently verified; known unchanged runtime-harness failure and live lifecycle verification pending
- Source plan: `work-items/active/feat/938-shell-rdd-status/implementation-plan.md`
- Related issue: `#938`
- Route: delegated direct; each implementation task crosses the multi-file writer trigger
- Delivery strategy: `ask-on-risk`; chain strategy unresolved
- Forecast: approximately 460–670 authored changed lines, excluding generated files

## Objective

Show the effective, native-authoritative Receipt-Driven Development mode in Gentle Shell without mutating configuration, starting a review, requesting consent, or implying delivery approval.

## Problem

Gentle Shell does not currently expose whether RDD is effectively enabled for the active repository. The native runtime already reports the effective decision, but Shell needs a shared fail-closed reader, a compact presentation, immediate refresh after Pi-owned mutations, and bounded refresh for changes made outside the current process.

The important exception is a project-local decision. Global and provider-default decisions need no extra visual label, while `status.source === "clone_local"` must be visible as a project override.

## Why

Users need to know whether RDD applies before they reach a review boundary, especially when one repository has been disabled locally. The indicator must remain observational: visibility must not change authority, consent, review state, or delivery behavior.

## Scope

- Extract shared read-only RDD status resolution from `extensions/gentle-ai.ts`.
- Keep `NativeReviewCli.reviewMode({ operation: "status" })` as the only authority.
- Preserve the three-second timeout and 30-second per-`cwd` memoization of successes and failures.
- Add selective and full cache invalidation without allowing stale reads to repopulate invalidated entries.
- Publish one Pi event after confirmed `/gentle:review-mode enable|disable` mutations.
- Add structured RDD presentation state to `ShellBarModel`.
- Render one line inside the existing `Project` group, immediately after `Branch` and before conditional `Session` and `Profile` fields.
- Render a suffix-free compact RDD segment outside the fullscreen sidebar.
- Refresh asynchronously after local events and through bounded, coalesced polling for external or global changes.
- Keep the RDD event subscription alive for the extension lifetime while making handlers inert when no eligible session is active.

## Visual contract

Fullscreen Status panel:

```text
╭─ Status ─────────────────────────╮
│ Project                          │
│  /home/user/project              │
│  Branch feat/example             │
│  Review RDD: OFF · Project       │
│  Session implementation          │
│  Profile default                 │
│                                  │
│ Changes                          │
│  2 files · +18 −4                │
│  /gentle:changes                 │
│                                  │
│ Integrations                     │
│  MCP: connected                  │
╰──────────────────────────────────╯
```

Supported line variants:

```text
Review RDD: ON
Review RDD: OFF
Review RDD: ON · Project
Review RDD: OFF · Project
Review RDD: ?
```

Presentation rules:

- `status.effective` alone decides `ON` or `OFF`.
- `status.source === "clone_local"` alone adds `· Project`.
- Sources `global` and `default` add no suffix.
- Unknown, unavailable, malformed, timed-out, or failed reads render `RDD: ?` with no suffix.
- `result.scope` describes native query breadth and never drives UI.
- `Review` is a category label; it does not mean a review is active, pending, or approved.
- The compact presentation renders `RDD: ON|OFF|?` without an origin suffix.

## Non-goals

- Do not enable or disable RDD from the renderer or refresh path.
- Do not start a native review, request consent, acknowledge authority, or affect delivery.
- Do not infer the effective decision from `global`, `cloneLocal`, package installation, or config files.
- Do not display `Global`, `Default`, `Clone`, or a separate `Scope` line.
- Do not create an independent `Review` group in the sidebar.
- Do not call the native process during render.
- Do not watch native persistence files directly.
- Do not introduce a global store or new event bus.
- Do not redesign the native review-mode protocol or session-change subsystem.
- Do not modify `lib/native-review-cli.ts` unless a narrowly required type import is proven first.

## Constraints and invariants

- Fail closed to `unknown`; unavailable information must never appear as `RDD: OFF`.
- Cache entries are temporary observations, never a second source of authority.
- A caller signal already aborted before invocation must not call `reviewMode()` or populate cache.
- Caller cancellation and concurrent invalidation must not allow stale reads to repopulate cache.
- Late results must not cross request generations, sessions, contexts, or `cwd` values.
- A failed refresh after invalidation must clear both the visible mode and project marker.
- Polling must be bounded, coalesced, and inactive without an eligible active Shell session.
- Repeated renders must not create repeated native reads.
- Event subscriptions are extension-lifetime resources; session shutdown clears session state and timers without removing the shared subscription.
- Keep production code, tests, and rationale together in reviewable work units.
- Preserve unrelated behavior and existing user changes.
- RSS-7's stale-context correction was approved on the development clone; RSS-8 addresses the residual race and was implemented under explicit user authorization. Push, PR, merge, release, and production-clone changes remain separate decisions.

## Authorized edit surfaces

These surfaces become active only after user approval of this ledger:

- `odd/tasks/rdd-sidebar-status.md`
- `lib/rdd-mode-status.ts`
- `extensions/gentle-ai.ts`
- `extensions/gentle-shell.ts`
- `lib/shell-bar.ts`
- `tests/rdd-status-line.test.ts`
- `tests/native-review-parity.test.ts`
- `tests/shell-bar.test.ts`
- `tests/shell-sidebar-layout.test.ts`
- `tests/gentle-shell.test.ts`
- `tests/review-risk-assessment.test.ts` — RSS-5 test-isolation correction authorized after the full suite exposed shared per-`cwd` memo leakage across contradictory fake readers.

Any additional production, generated, runtime, or test file requires a documented reason and renewed scope authorization before editing.

## TDD mode and verification

- Mode: strict TDD enabled.
- Source: `openspec/config.yaml` (`strict_tdd: true`).
- Configured runner: `pnpm test`.
- Focused RED/GREEN cycles use Node's test runner for the affected test files.
- Every behavioral task must record observed RED before production edits, then GREEN, triangulation, and refactor evidence.
- A test-model error is not valid RED evidence.
- Run package commands serially; do not use `pnpm exec` for already-installed formatting or lint tools because it may trigger package lifecycle installation.

Focused and final commands:

```bash
node --experimental-strip-types --test tests/rdd-status-line.test.ts
node --experimental-strip-types --test tests/native-review-parity.test.ts
node --experimental-strip-types --test \
  tests/shell-bar.test.ts \
  tests/shell-sidebar-layout.test.ts
node --experimental-strip-types --test tests/gentle-shell.test.ts
pnpm run typecheck
pnpm test
pnpm run check:runtime-modules
pnpm run test:harness
git diff --check
```

The task that owns a behavior runs its focused commands. Full-suite, runtime-module, harness, and whitespace results are recorded before feature closure. Any failed, unavailable, skipped, or pending check remains explicit.

## Tasks

- [x] **RSS-1 — Centralize authoritative RDD status reads**
  - Route: delegated writer; three non-trivial files trigger mandatory delegation.
  - Allowed surfaces:
    - `lib/rdd-mode-status.ts`
    - `extensions/gentle-ai.ts`
    - `tests/rdd-status-line.test.ts`
  - RED:
    - Cover `on`, `off`, and `unknown` projection.
    - Cover `projectOverride: true` only for `source === "clone_local"`.
    - Cover malformed status, absent capability, rejection, timeout, and status-only invocation.
    - Cover per-`cwd` success/failure memoization, expiry, selective/full invalidation, caller abort, and invalidation races.
    - Prove `result.scope` never decides presentation state.
  - GREEN:
    - Add `lib/rdd-mode-status.ts` and migrate the existing Gentle AI consumer without changing its detailed status message or native command behavior.
    - Preserve the three-second timeout and 30-second TTL.
  - Triangulate/refactor:
    - Exercise two repositories, a reader that ignores `AbortSignal`, pre-aborted and late-aborted callers, ordinary failure memoization, and stale-read suppression.
    - Remove duplicated reader/cache logic only after GREEN.
  - Focused checks:

    ```bash
    node --experimental-strip-types --test tests/rdd-status-line.test.ts
    node --experimental-strip-types --test \
      tests/native-review-parity.test.ts
    pnpm run typecheck
    ```

  - Work-unit commit proposal: `refactor(rdd): centralize authoritative mode status reads`.
  - Completion evidence: RED observed for the missing shared reader and malformed partial native status; GREEN 23/23 focused tests; parity 22/22; typecheck passed with 196 baseline diagnostics and no regressions; independent verification found no blocker; native review approved and acknowledged; committed as `e1f94388`.

- [x] **RSS-2 — Publish mutation-driven invalidation**
  - Route: delegated writer; two non-trivial files trigger mandatory delegation.
  - Allowed surfaces:
    - `extensions/gentle-ai.ts`
    - `tests/native-review-parity.test.ts`
  - RED:
    - `status` emits no event.
    - Successful `enable` and `disable` invalidate the active `cwd` and emit exactly one `RDD_MODE_STATUS_CHANGED` event carrying that `cwd`.
    - Failure and unavailable capability emit no event.
    - Existing consent cleanup after disable and global-off warning behavior remain covered.
  - GREEN:
    - Invalidate and emit only after a confirmed mutation.
    - Do not seed the cache from the mutation response; Shell performs a fresh authoritative read.
  - Triangulate/refactor:
    - Cover consecutive operations and centralize emission only if it reduces duplication.
  - Focused checks:

    ```bash
    node --experimental-strip-types --test \
      tests/native-review-parity.test.ts
    node --experimental-strip-types --test tests/rdd-status-line.test.ts
    pnpm run typecheck
    ```

  - Work-unit commit proposal: `feat(rdd): publish review mode status invalidation`.
  - Completion evidence: RED proved missing invalidation/event publication and exposed the global-off no-op edge; GREEN parity 22/22 and shared-reader 23/23; typecheck passed with 196 baseline diagnostics and no regressions; independent verification found no blocker; native review approved and acknowledged; committed as `6d62903c`.

- [x] **RSS-3 — Render compact structured RDD status**
  - Route: delegated writer; three non-trivial files trigger mandatory delegation.
  - Allowed surfaces:
    - `lib/shell-bar.ts`
    - `tests/shell-bar.test.ts`
    - `tests/shell-sidebar-layout.test.ts`
  - RED:
    - Cover every line variant in the visual contract.
    - Prove `· Project` appears only for a clone-local source projection.
    - Prove one RDD line appears inside `Project`, after `Branch` and before conditional `Session` and `Profile`.
    - Prove there is no independent `Review` group and opaque statuses remain under `Integrations`.
    - Cover legacy models without RDD fields, width bounds, ANSI/Unicode integrity, compact ordering, and complete RDD removal before ambiguous truncation.
  - GREEN:
    - Add structured `rddMode` and `rddProjectOverride` fields to `ShellBarModel`.
    - Add a pure line/token renderer and integrate it into fullscreen and compact presentations.
  - Triangulate/refactor:
    - Test exact width breakpoints and extract helpers only when they reduce renderer complexity.
  - Focused checks:

    ```bash
    node --experimental-strip-types --test \
      tests/shell-bar.test.ts \
      tests/shell-sidebar-layout.test.ts
    pnpm run typecheck
    ```

  - Work-unit commit proposal: `feat(shell): render RDD status in sidebar and footer`.
  - Completion evidence: RED observed because the pure RDD renderer was absent; GREEN focused renderer/layout suite 67/67; typecheck passed with no regressions and three improved diagnostic pairs; independent verification found no blocker; native review approved and acknowledged; committed as `77da142c`.

- [x] **RSS-4 — Refresh RDD across the Shell lifecycle**
  - Route: delegated writer; two non-trivial files trigger mandatory delegation.
  - Allowed surfaces:
    - `extensions/gentle-shell.ts`
    - `tests/gentle-shell.test.ts`
  - RED:
    - Initial render is `RDD: ?` without `· Project`.
    - Global/default results update mode without a suffix; clone-local results add `· Project`.
    - Active-`cwd` events invalidate and refresh; foreign-`cwd` events are ignored.
    - Bounded polling detects external/global changes without overlapping reads.
    - Controlled promises prove older, closed-session, aborted, and wrong-context results cannot win.
    - Session shutdown stops polling and late renders while extension-lifetime event handling works in a second session.
    - Disabled Shell and excluded child contexts remain inert.
  - GREEN:
    - Maintain mode, project marker, request generation, abort controller, and polling state outside render.
    - Subscribe once for the extension lifetime.
    - Invalidate the sidebar and request render only when visible state changes.
  - Triangulate/refactor:
    - Cover `global → clone_local` with unchanged effective mode, `on → unknown`, `off → on`, same `cwd` across sessions, unavailable capability, and a native reader that settles late.
  - Focused checks:

    ```bash
    node --experimental-strip-types --test tests/gentle-shell.test.ts
    node --experimental-strip-types --test \
      tests/shell-bar.test.ts \
      tests/shell-sidebar-layout.test.ts
    pnpm run typecheck
    ```

  - Work-unit commit proposal: `feat(shell): refresh RDD status across session lifecycle`.
  - Completion evidence: RED observed because injected authoritative reads never started; GREEN Shell lifecycle suite 99/99 and renderer/layout regression 67/67; typecheck passed with no regressions and three improved diagnostic pairs; independent verification found no blocker; native review approved and acknowledged; committed as `2c5fc150`.

- [x] **RSS-5 — Close feature verification and visual acceptance**
  - Route: delegated verification when required by the RDD-aware verification plan; parent retains final reconciliation and one command spot check.
  - Allowed surfaces:
    - `odd/tasks/rdd-sidebar-status.md`
    - `tests/review-risk-assessment.test.ts` (authorized RSS-5 test-isolation correction only)
  - Verify:
    - Run all focused commands, configured full suite, runtime-module parity, runtime harness, and whitespace check serially.
    - Perform structural readback against this ledger and the source implementation plan.
    - Record every failed, unavailable, skipped, or pending check without inference.
    - Record authored changed-line count and resolve `ask-on-risk` delivery strategy before any delivery action if the branch exceeds approximately 400 lines.
    - Perform interactive visual confirmation in fullscreen and compact layouts when a live Pi host is available; otherwise leave it explicitly pending for the user.
  - Completion evidence: focused suites passed (RDD reader 23/23, parity 22/22, renderer/layout 67/67, Shell lifecycle 99/99, risk assessment 64/64); typecheck passed with 196 baseline diagnostics and no regressions; full suite passed 2,939 tests with 38 skipped and only the pre-existing unchanged runtime-harness assertion failing; runtime-module parity and `git diff --check` passed. Live fullscreen/compact visual acceptance remains explicitly pending for an interactive Pi host.

- [x] **RSS-6 — Integrate current main and effective-profile downstream state**
  - Completion evidence: merged updated `main` into the feature branch and pushed it at `a78a5a35`; integrated the verified branch with effective-profile behavior in `downstream/main` at `71a2c81b`; focused integration verification passed 348/348; native review approved and acknowledged.

- [x] **RSS-7 — Prevent stale ExtensionContext access in RDD polling**
  - Route: delegated writer; production and regression-test changes trigger mandatory multi-file delegation.
  - Allowed surfaces:
    - `extensions/gentle-shell.ts`
    - `tests/gentle-shell.test.ts`
    - `odd/tasks/rdd-sidebar-status.md`
  - RED:
    - Add a context double whose `hasUI`, `cwd`, and `sessionManager` getters throw after invalidation.
    - Capture a queued polling callback, close or replace its session, invalidate the old context, and prove the callback currently throws.
    - Observed before production edits: `node --experimental-strip-types --test tests/gentle-shell.test.ts` reported 108 passing and 1 failing test; `assert.doesNotThrow` failed with `Error: stale ExtensionContext getter: hasUI` from `refreshRddMode` at `extensions/gentle-shell.ts:919`, reached by the queued callback at line 943.
  - GREEN:
    - Make polling resolve `currentContext` per tick instead of closing over a session context.
    - Check reader availability and context identity before accessing `ctx.hasUI` or other protected properties.
    - Clear the shared current-context reference before resetting RDD state during shutdown.
    - Snapshot and validate the current context in the RDD change listener.
    - Observed after the focused production fix: the focused Shell suite passed 109/109.
  - Triangulate/refactor:
    - Prove queued ticks and late async results from old sessions are inert.
    - Prove replacement sessions still poll normally without overlapping reads or stale renders.
    - Preserve generation, abort, memoization, coalescing, and extension-lifetime listener behavior.
    - Observed lifecycle triangulation: the expanded focused Shell suite passed 110/110, including replacement-session polling, no overlapping reads, and no stale UI renders.
  - Focused checks:

    ```bash
    node --experimental-strip-types --test tests/gentle-shell.test.ts
    pnpm run typecheck
    pnpm test
    git diff --check
    ```

  - Verification evidence:
    - `node --experimental-strip-types --test tests/gentle-shell.test.ts`: 110/110 passed.
    - `pnpm run typecheck`: passed with 196 recorded baseline diagnostics, no regressions, and 3 improved diagnostic pairs.
    - `pnpm test`: 2,975 passed and 38 skipped before the known unchanged runtime-harness assertion at `tests/runtime-harness.mjs:537` (`the real primary hook must stop a second distinct direct file`); the provider contract mirror check passed. `tests/runtime-harness.mjs` and `extensions/gentle-ai.ts` are unchanged from the current base.
    - `git diff --check`: passed.
  - Work-unit commit proposal: `fix(shell): avoid stale context access in RDD polling`.
  - Source plan: `work-items/active/feat/938-shell-rdd-status/stale-context-crash-fix-plan.md`.

- [x] **RSS-8 — Eliminate residual stale-context races with plain-data session snapshots**
  - Status: Implemented and independently verified with recorded exceptions. Preserve RSS-7 as completed historical evidence; this task addresses the residual ordering that recurred after `e95db48a`.
  - Route: delegated writer; the planned production and regression-test changes trigger mandatory multi-file delegation.
  - Design:
    - During active `session_start`, while the context is valid, synchronously capture one immutable plain-data RDD session snapshot containing only a unique session token/generation identifier, `cwd`, `sessionId`, and UI eligibility. Do not retain an operational `ExtensionContext` for polling, event handling, or late-result work.
    - Polling ticks, shared `RDD_MODE_STATUS_CHANGED` event handling, and late promise continuations must use the immutable snapshot and other plain RDD state only. They must never dereference `ExtensionContext`, including `hasUI`, `cwd`, or `sessionManager`.
    - Bind status reads and the render host to the same session token, validate that token before every state or render write, and clear any old footer/render host when a session starts or is replaced before installing the new host.
    - During shutdown, clear the RDD session state before reset or cancellation. Preserve request generation, abort handling, coalescing, memo invalidation, and the extension-lifetime event listener behavior.
    - A redundant native status read before lifecycle cleanup can be harmless because no lifecycle signal may yet have cleared the plain snapshot. The required invariants are no stale context access and no stale or cross-session state or render write, not necessarily zero reads before cleanup.
  - Strict TDD RED cases:
    - Use context doubles whose `hasUI`, `cwd`, and `sessionManager` getters throw after invalidation.
    - Reproduce invalidation before shutdown followed by a queued polling tick; dispatch a stale event after invalidation; and resolve a deferred result while the old context is stale.
    - Replace a session before the new footer/render host is installed and assert no uncaught throw or rejection and no stale state or render.
    - Preserve the existing coalescing, replacement-session, and event tests. Do not require no reader call before cleanup when the runtime provides no lifecycle signal.
  - Observed RED: before production edits, the focused Shell suite reported 110 passing and 4 failing RSS-8 regressions: stale `hasUI` on a queued poll, stale `cwd` on the active-cwd event, stale `sessionManager` with an unhandled deferred-result rejection, and one stale old-host render.
  - Observed GREEN: after the snapshot and token-bound host implementation, the focused Shell suite passed 114/114; the four RSS-8 regressions passed alongside the existing coalescing, replacement-session, late-result, and event-listener coverage.
  - Triangulation/refactor: the focused suite preserved the prior 110 lifecycle checks while covering invalidation-before-cleanup, stale events, deferred results, and replacement before footer installation; the implementation keeps generation, abort, coalescing, memo invalidation, polling, and extension-lifetime listener behavior.
  - Verification plan:
    - Focused Shell lifecycle test: `node --experimental-strip-types --test tests/gentle-shell.test.ts`.
    - Typecheck: `pnpm run typecheck`.
    - Full suite: `pnpm test`.
    - Diff check: `git diff --check`.
    - Live `/reload`, `/new`, `/resume`, and `/fork` check with at least one polling interval; confirm Pi remains active, no stale render/state appears, and the replacement session continues to update.
    - Record the existing runtime-harness exception only if it is still present when implementation is later verified; do not pre-record it as current evidence.
  - Source plan: `work-items/active/feat/938-shell-rdd-status/stale-context-crash-fix-plan.md`, whose former workaround is explicitly incomplete and superseded by this plain-data snapshot design.
  - Work-unit commit proposal: `fix(shell): eliminate stale context access with session snapshots`.
  - Completion evidence: implementation and strict-TDD focused verification are complete. Independent verification confirmed the focused Shell suite passed 114/114, `pnpm run typecheck` passed with 196 recorded baseline diagnostics, no regressions, and 3 improved diagnostic pairs, and `git diff --check` passed. `pnpm test` reached 2,979 passing and 38 skipped tests before the known unchanged runtime-harness assertion at `tests/runtime-harness.mjs:537` (`the real primary hook must stop a second distinct direct file`); `tests/runtime-harness.mjs` is not modified by this candidate. Live `/reload`, `/new`, `/resume`, and `/fork` verification remains pending in an interactive Pi host.

## Acceptance criteria

- Native `status.effective` is the only source for `ON` or `OFF`.
- Only native `status.source === "clone_local"` produces `· Project`.
- `global` and `default` never add visible source text.
- `result.scope` never drives presentation.
- Unknown and every unavailable/failure path render `RDD: ?` without a stale project marker.
- Fullscreen RDD appears as one line inside `Project`, after `Branch` and before conditional `Session` and `Profile`.
- No independent `Review` group is created.
- Compact presentation shows `RDD: ON|OFF|?` without an origin suffix and remains width-safe.
- Render performs no native call or mutation.
- Successful local mode mutations update Shell immediately.
- External/global changes update through bounded, coalesced polling.
- No request result crosses generation, session, context, or repository boundaries.
- Event listeners survive consecutive sessions without duplicate registration or stale writes.
- Existing review-mode messages, consent cleanup, global-off warning, and native compatibility remain intact.
- Focused tests, configured suite, typecheck, runtime-module parity, harness, and whitespace checks pass, or any exception is recorded with concrete evidence.
- Live visual verification confirms the documented fullscreen and compact representations, or remains explicitly pending when no interactive host is available.

## Delivery and review workload

- Forecast: approximately 460–670 authored changed lines across production and tests.
- The approximately 400-line guideline is advisory per task but triggers the selected `ask-on-risk` delivery decision for accumulated branch delivery.
- Expected work units: four implementation commits plus the RSS-8 corrective unit and a verification closeout update.
- RSS-8 is implemented as one corrective work unit; its focused, typecheck, full-suite exception, whitespace, and independent-verification evidence are recorded above.
- Proposed slice 1: authoritative reader plus mutation invalidation, approximately 180–270 lines.
- Proposed slice 2: pure rendering plus Shell lifecycle, approximately 280–400 lines.
- If the lifecycle unit alone exceeds the guideline, separate pure rendering from lifecycle rather than reduce tests, documentation, or clarity.
- Commit proposals are recorded for review; no commit is authorized before the user approves this ledger and implementation start.
- Push, pull request creation, merge, and release remain separate user decisions.

## Progress and evidence

| Task | Status | TDD/verification evidence | Commit | Native review assessment |
| --- | --- | --- | --- | --- |
| RSS-1 | Complete | RED and GREEN 23/23; parity 22/22; typecheck passed | `e1f94388` | Approved and acknowledged; three non-blocking readability suggestions recorded |
| RSS-2 | Complete | RED/GREEN parity 22/22; reader 23/23; typecheck passed | `6d62903c` | Approved and acknowledged; two non-blocking readability suggestions recorded |
| RSS-3 | Complete | RED/GREEN renderer and layout 67/67; typecheck passed | `77da142c` | Approved and acknowledged |
| RSS-4 | Complete | RED/GREEN lifecycle 99/99; renderer/layout 67/67; typecheck passed | `2c5fc150` | Approved and acknowledged; six non-blocking advisory findings recorded |
| RSS-5 | Complete with recorded exceptions | Focused and full verification recorded; pre-existing harness failure and live visual check pending | `47529cda` / `e0737558` | Approved and acknowledged; one non-blocking readability suggestion recorded |
| RSS-6 | Complete | Integration verification passed 348/348 | `a78a5a35`, downstream `71a2c81b` | Approved and acknowledged |
| RSS-7 | Complete | RED observed (`hasUI` stale-context throw); GREEN 109/109; triangulation, parent spot check, and independent verification 110/110; typecheck and whitespace passed; full suite retained the known unchanged runtime-harness assertion | `e95db48a` | Committed-range four-lens review approved and acknowledged |
| RSS-8 | Complete with recorded exceptions | RED 110+4 failures; GREEN and independent focused verification 114/114; typecheck and whitespace passed; full suite retained the unchanged runtime-harness assertion; live lifecycle check pending | — | Pending native review |

## Decisions and rationale

- The source is shown only for project-local decisions because that exception changes how users interpret the repository; global/default labels add space without actionable distinction.
- RDD belongs inside `Project` because it is repository context and one line avoids a tall standalone review group.
- Event invalidation gives immediate local feedback; bounded polling covers external/global changes without reading native persistence files or calling the process during render.
- The event subscription belongs to the extension lifetime so closing one session does not break later sessions in the same extension instance.

## Next step

Run native review for the RSS-8 candidate, then perform live `/reload`, `/new`, `/resume`, and `/fork` verification in an interactive Pi host when available. Do not modify the `gentle-shell` production clone. Commit, push, PR, merge, release, and production deployment remain unauthorized.
