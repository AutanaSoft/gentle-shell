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
- Keep this follow-up below 400 changed production/documentation lines and below 400 changed test lines.

## Tasks

- [x] T1 — Implement pin-aware Status profile resolution, focused tests, and documentation; run focused and repository checks; commit as one reviewable work unit.
- [x] T2 — Rebase the design onto current main: refresh one cached effective-profile snapshot through
  invalidation/watch events, use it in Status and the live header, and prove repeated renders perform
  no profile filesystem or Git resolution.
- [x] T3 — Merge current `main` at `43269de3`, reconcile the feature with the live header and current
  shell behavior, and verify the merged candidate.
- [x] T4 — Replace the lossy `pinned` boolean with the effective source (`global`, `local`, or `repo`), render the winning pin scope, cover same-profile source transitions, update documentation, and verify within the user-specified line budgets. Route: delegated writer because the change spans multiple non-trivial files.
- [x] T5 — Integrate current `main` at `cf1fdb65`, resolve the `extensions/gentle-shell.ts` import conflict while preserving both effective-profile state and the fullscreen header rule, run focused and repository verification, and commit the integration.

## Acceptance criteria

- No valid pin: `Profile <global-active-name>`.
- Valid clone-local pin: `Profile <effective-name> (local)`.
- Valid repository declaration: `Profile <effective-name> (repo)`.
- Invalid, stale, missing, or unreadable pins fall back to the global active profile without a suffix.
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
