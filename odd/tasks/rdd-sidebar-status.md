# RDD Sidebar Status

- Feature: `rdd-sidebar-status`
- Repository: `gentle-pi`
- Branch: `feat/shell-rdd-status-v2`
- Base: `main` / `upstream/main` at `cf1fdb65c267d9fbdad2c48f6c9e008f3f91d7a3`
- Status: implementation authorized; RSS-1 through RSS-3 complete, RSS-4 in progress
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
- No implementation, test mutation, commit, push, PR, or release begins until the user approves this ledger.

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

- [ ] **RSS-4 — Refresh RDD across the Shell lifecycle**
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
  - Completion evidence: RED observed because injected authoritative reads never started; GREEN Shell lifecycle suite 99/99 and renderer/layout regression 67/67; typecheck passed with no regressions and three improved diagnostic pairs; independent verification found no blocker. Work-unit commit pending native review.

- [ ] **RSS-5 — Close feature verification and visual acceptance**
  - Route: delegated verification when required by the RDD-aware verification plan; parent retains final reconciliation and one command spot check.
  - Allowed surfaces:
    - `odd/tasks/rdd-sidebar-status.md`
  - Verify:
    - Run all focused commands, configured full suite, runtime-module parity, runtime harness, and whitespace check serially.
    - Perform structural readback against this ledger and the source implementation plan.
    - Record every failed, unavailable, skipped, or pending check without inference.
    - Record authored changed-line count and resolve `ask-on-risk` delivery strategy before any delivery action if the branch exceeds approximately 400 lines.
    - Perform interactive visual confirmation in fullscreen and compact layouts when a live Pi host is available; otherwise leave it explicitly pending for the user.
  - Completion evidence: pending.

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
- Expected work units: four implementation commits plus a verification closeout update.
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
| RSS-4 | Verified; review pending | RED/GREEN lifecycle 99/99; renderer/layout 67/67; typecheck passed | — | Pending |
| RSS-5 | Awaiting approval | — | — | — |

## Decisions and rationale

- The source is shown only for project-local decisions because that exception changes how users interpret the repository; global/default labels add space without actionable distinction.
- RDD belongs inside `Project` because it is repository context and one line avoids a tall standalone review group.
- Event invalidation gives immediate local feedback; bounded polling covers external/global changes without reading native persistence files or calling the process during render.
- The event subscription belongs to the extension lifetime so closing one session does not break later sessions in the same extension instance.

## Next step

Complete RSS-1 through strict RED/GREEN/triangulation, record evidence, and continue task by task.
