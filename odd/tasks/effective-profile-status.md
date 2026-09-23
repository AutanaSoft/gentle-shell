# Effective repository profile in Status

## Objective

Fix GitHub issue #1176 so the fullscreen Status sidebar shows the profile that governs subagent launches in the current repository. Preserve the winning source returned by `resolveProfilePin()` and display `(local)` for a clone-local pin or `(repo)` for a repository declaration; otherwise show the globally active profile without a suffix.

## Context

- Upstream issue: https://github.com/Gentleman-Programming/gentle-shell/issues/1176
- Starting point: `origin/main` at `1170dc84c2198b53807431f6e03d02bf8dcc3444`
- Re-investigation baseline: `main` at `43269de359c5052d2cadb72ab4cf2d57ca0211b0`
- Branch: `fix/effective-profile-status`
- Pre-existing untracked `mise.toml` is outside this feature and must remain untouched.
- Current main routes the profile through both the fullscreen Status card and live header; profile
  resolution must stay outside `digest()` and `render()`.

## Scope

- Resolve the effective profile through the existing repository-pin authority.
- Keep profile state structured through the shell model and render the valid winning pin source as `(local)` or `(repo)`.
- Refresh the Status digest when the global profile or relevant pin state changes.
- Preserve the compact bottom bar behavior: it does not show a profile.
- Add focused regression coverage and update user-facing documentation if the documented semantics require clarification.
- Keep the correction reviewable without shrinking necessary tests or documentation to meet a line target.
- Review follow-up plan: `work-items/active/fix/1176-effective-profile-status/review-follow-up-implementation-plan.md`.
- Baseline for this follow-up: PR head `cfbdf1be`; local feature branch `8e3578c9` contains the later main merge, with the same watcher/test behavior and a changed documentation sentence.
- TDD mode: enabled for these tasks by the user-accepted follow-up plan (RED/GREEN/TRIANGULATE/REFACTOR); exact focused runner: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts`.
- RDD switch: off (clone-local; observed before implementation). Native review is not enabled for this candidate.
- Review workload: forecast approximately 250–400 authored diff lines for T8–T10; the existing PR already exceeds 400 lines and requests `size:exception`. Delivery strategy: `exception-ok` for PR #1252, explicitly selected by the user despite its existing size-exception request. Keep task-scoped work-unit commits on this feature branch; no push/PR creation is authorized here.

## Tasks

- [x] T1 — Implement pin-aware Status profile resolution, focused tests, and documentation; run focused and repository checks; commit as one reviewable work unit.
- [x] T2 — Rebase the design onto current main: refresh one cached effective-profile snapshot through
  invalidation/watch events, use it in Status and the live header, and prove repeated renders perform
  no profile filesystem or Git resolution.
- [x] T3 — Merge current `main` at `43269de3`, reconcile the feature with the live header and current
  shell behavior, and verify the merged candidate.
- [x] T4 — Replace the lossy `pinned` boolean with the effective source (`global`, `local`, or `repo`), render the winning pin scope, cover same-profile source transitions, update documentation, and verify within the user-specified line budgets. Route: delegated writer because the change spans multiple non-trivial files.
- [x] T5 — Integrate current `main` at `cf1fdb65`, resolve the `extensions/gentle-shell.ts` import conflict while preserving both effective-profile state and the fullscreen header rule, run focused and repository verification, and commit the integration.
- [x] T6 — Correct review finding `R4-watch-runtime-error`: handle asynchronous `FSWatcher` errors without terminating the Pi host, add focused regression coverage, validate within the native correction budget, and commit the fix.
- [x] T7 — Integrate updated `main` at `b6188bef`, resolve the test import conflict while preserving both subscription-usage and effective-profile coverage, verify the merged candidate, push the feature branch, then integrate it into `downstream/main`.
- [x] T8 — Filter irrelevant profile watcher events and reuse the resolved worktree identity; preserve null-filename, ancestor creation, atomic replacement, and non-Git global behavior. Route: delegated writer (production and regression tests); checks: observed RED/GREEN focused tests, resolver/read counters, typecheck, diff check, work-unit commit.
- [ ] T9 — Remove real OS watcher/timer dependence from both fullscreen Status refresh regressions while preserving integration assertions and rebind coverage. Route: delegated writer (integration tests and narrow test seam); checks: observed RED/GREEN, focused repeat, suite, work-unit commit.
- [ ] T10 — Clarify global-store and invalid/stale-pin fallback in the fullscreen documentation, verify consistency with reference docs, and commit the documentation work unit. Route: inline direct unless additional non-trivial files become necessary; checks: readback, markdown/diff check, work-unit commit.

## Acceptance criteria

- No valid pin: `Profile <global-active-name>`.
- Valid clone-local pin: `Profile <effective-name> (local)`.
- Valid repository declaration: `Profile <effective-name> (repo)`.
- Invalid, stale, missing, or unreadable pin layers are skipped; a valid lower-priority repository declaration wins before falling back to the global active profile without a suffix.
- Irrelevant watched-directory changes do not schedule profile refresh or synchronous Git resolution; relevant and unknown-filename changes still refresh the snapshot.
- The two fullscreen refresh regressions use controlled watcher events and debounce timing, not OS delivery or short wall-clock deadlines.
- A same-name transition between local and repository sources refreshes the displayed scope.
- Local pin precedence over repository declaration remains owned by `resolveProfilePin()`.
- Creating, changing, or removing a pin updates the fullscreen Status digest and live header without
  restarting Pi.
- Repeated Status/header `digest()` and `render()` calls perform no profile filesystem or Git
  resolution.
- External atomic replacements are observed through debounced parent-directory watchers, which are
  disposed with the shell component.
- The compact bottom bar remains unchanged.
- Focused tests, typecheck/runtime checks, complete test suite, and `git diff --check` pass or any skipped/failed check is reported.

## Follow-up progress

- T8 implemented and independently verified; recording its work-unit commit. T9 and T10 pending. The two new T8 tests retain 130 ms wall-clock waits, to be removed with the T9 timer refactor.
- Current branch is ahead of `origin/fix/effective-profile-status` because of an earlier local main merge; do not silently reset, rebase, push, or use the remote PR head as the checked-out source.
- Scoped mapping complete; next: commit T8 as one work unit, then determinize all profile watcher timing tests in T9.

## Follow-up evidence

- T8 RED: injected watcher tests failed before implementation: unrelated `index` event caused an extra read (`2 !== 1`); outside-Git global refresh repeated worktree lookup (`2 !== 1`).
- T8 GREEN: two targeted tests passed after filtering by next path component and caching the watcher-side worktree identity per `cwd`.
- T8 writer and independent verifier: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts` — 148 passed, 0 failed; `node scripts/check-types.mjs` — passed with 195 baseline diagnostics, no regression; `git diff --check` — passed.
- T8 independent finding: the two new tests use 130 ms real waits against a 100 ms debounce; T9 must replace those waits too. Relevant-event Git from the separate profile reader is not measured by watcher-side counters and was intentionally not changed.
- T8 parent spot check: `git diff --check` passed; no untracked source changes. RDD-off native assessment reported high risk; independent verifier completed with no confirmed production defect.

## Evidence

- T1 commit: `ef07e0ef` (`fix(shell): show effective repository profile`)
- TDD RED: the new pin test expected `other (pinned)` but observed the global `team` profile before implementation.
- Focused tests: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts` — 60 passed, 0 failed; `node --experimental-strip-types --test tests/profile-pin.test.ts` — 20 passed, 0 failed.
- Full tests: `node --experimental-strip-types --test tests/*.test.ts` — 2643 passed, 0 failed, 38 skipped.
- Type check: `node scripts/check-types.mjs` — passed with 197 recorded baseline diagnostics, no regressions, and 2 diagnostic pairs improved.
- Runtime module check: skipped because `scripts/check-runtime-modules.mjs` does not exist on this branch.
- Diff check: `git diff --check` — passed.
- Verification incident: `pnpm run typecheck` was discarded as a hermetic receipt because pnpm 12 dependency verification triggered install/postinstall side effects in ignored dependency areas. Read-only Git inspection confirmed no new tracked changes; final verification used direct Node commands only.
- Native review: unavailable before lineage creation. Two committed-range START attempts against `1170dc84c2198b53807431f6e03d02bf8dcc3444` were rejected with `candidate-target-projection-drift`; both reported `lineage_created: false` and performed no mutation.
- T2 focused tests: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts tests/shell-sidebar-layout.test.ts` — 82 passed, 0 failed.
- T2 full tests: `node --experimental-strip-types --test tests/*.test.ts` — 2639 passed, 0 failed, 47 skipped.
- T2 type check: `node scripts/check-types.mjs` — passed with 197 baseline diagnostics and no regressions.
- T2 diff check: `git diff --check` — passed.
- T2 independent verification: passed with no findings; confirmed cached Status/header parity, compact-bar stability, watcher debounce/disposal, atomic replacement handling, and no profile I/O from repeated digest/render calls.
- T2 commit: `692d140b` (`fix(shell): refresh effective profile outside render path`).
- T3 focused tests after merge: 160 passed, 0 failed.
- T3 split full suite: 2894 total — 2847 passed, 0 failed, 47 skipped. The relay-routing file
  used `GENTLE_PI_GENTLE_AI_DEV_BINARY=/usr/bin/true` because the package-local v3.4.0 runtime is
  absent; the remaining suite ran with the normal environment.
- T3 type check: passed with 196 baseline diagnostics and no regressions.
- T3 diff check: `git diff --check` — passed.
- T3 merge commit: `e32c62ce` (`chore(branch): merge current main into effective profile fix`).
- T4 TDD RED: focused tests observed 129 passed and 5 failed after expectations changed to exact global/local/repo sources, including missing local suffixes and old reader state.
- T4 TDD GREEN: focused tests passed with 134 passed and 0 failed after replacing `pinned` with `source` and comparing source during snapshot refresh.
- T4 focused verification: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts tests/shell-sidebar-layout.test.ts` — 160 passed, 0 failed.
- T4 type check: `node scripts/check-types.mjs` — passed with 196 recorded diagnostics, no regressions, and 3 file/code pairs improved.
- T4 full suite: the required command reported 2846 passed, 1 failed, and 47 skipped only in `tests/review-host-relay-routing.test.ts`; the mandated override passed 31 tests, and the remaining suite passed 2816 tests with 47 skipped.
- T4 diff check: `git diff --check` — passed after removing one test trailing-whitespace line.
- T4 line budgets: 19 changed production/documentation lines and 112 changed test lines (additions plus deletions; task-artifact bookkeeping excluded).
- T5 conflict resolution: preserved `dirname`, `ShellProfileState`, and effective-profile snapshot behavior from the feature branch while retaining `renderShellHeaderRule` and the decorative-row mouse guard from `main`.
- T5 focused tests: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts tests/shell-sidebar-layout.test.ts` — 166 passed, 0 failed.
- T5 type check: `node scripts/check-types.mjs` — passed with 196 recorded diagnostics, no regressions, and 3 file/code pairs improved.
- T5 full suite: the required command reported 2923 passed, 1 failed, and 47 skipped only in `tests/review-host-relay-routing.test.ts`; the established native-runtime override passed that file's 31 tests, and the remaining suite passed 2893 tests with 47 skipped.
- T5 diff check: `git diff --check --cached` — passed.
- T5 merge commit: `c1bd0148` (`chore(branch): merge current main into effective profile fix`).
- T6 correction: asynchronous watcher errors close and retire the failed watcher, suppress retry loops, and remain safe after disposal; focused regression coverage exercises the error lifecycle.
- T6 correction size: 44 diff lines across production and test code, within the authorized 80-line plan.
- T6 focused tests: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts tests/shell-sidebar-layout.test.ts` — 167 passed, 0 failed.
- T6 type check: `node scripts/check-types.mjs` — passed with 196 recorded diagnostics, no regressions, and 3 file/code pairs improved.
- T6 diff check: `git diff --check` — passed.
- T7 conflict resolution: retained `createEffectiveProfileSnapshot` and `createShellBarComponent` from the feature branch while preserving `USAGE_SOURCE_EVENT` and `USAGE_SOURCE_SCHEMA` from updated `main`.
- T7 focused verification: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/shell-bar.test.ts tests/shell-sidebar-layout.test.ts tests/shell-usage.test.ts` — 211 passed, 0 failed, 0 skipped.
- T7 type check: `node scripts/check-types.mjs` — passed with 196 recorded diagnostics and no regressions.
- T7 merge checks: no unmerged paths or conflict markers; `git diff --check --cached` passed.
