# Effective repository profile in Status

## Objective

Fix GitHub issue #1176 so the fullscreen Status sidebar shows the profile that governs subagent launches in the current repository. Append `(pinned)` only when a valid clone-local pin or repository declaration wins; otherwise show the globally active profile without a suffix.

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
- Keep profile state structured through the shell model and render `(pinned)` only for a valid winning pin.
- Refresh the Status digest when the global profile or relevant pin state changes.
- Preserve the compact bottom bar behavior: it does not show a profile.
- Add focused regression coverage and update user-facing documentation if the documented semantics require clarification.

## Tasks

- [x] T1 — Implement pin-aware Status profile resolution, focused tests, and documentation; run focused and repository checks; commit as one reviewable work unit.
- [x] T2 — Rebase the design onto current main: refresh one cached effective-profile snapshot through
  invalidation/watch events, use it in Status and the live header, and prove repeated renders perform
  no profile filesystem or Git resolution.
- [x] T3 — Merge current `main` at `43269de3`, reconcile the feature with the live header and current
  shell behavior, and verify the merged candidate.

## Acceptance criteria

- No valid pin: `Profile <global-active-name>`.
- Valid local or repository pin: `Profile <effective-name> (pinned)`.
- Invalid, stale, missing, or unreadable pins fall back to the global active profile without `(pinned)`.
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
- T3 merge commit: pending.
