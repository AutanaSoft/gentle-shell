# Profile sidebar atomic-watch regression

## Objective

Restore live fullscreen profile updates when the platform reports only the temporary filename from an atomic profile or pin replacement and omits the final target filename.

## Evidence and boundaries

- Live Pi trace on 2026-09-23: pin replacement from `MediumWork (local)` to `HeavyWork (local)` emitted `rename` for `.profile-pin.json.<uuid>.tmp`, rejected by `extensions/gentle-shell.ts`; no target-basename event or snapshot refresh followed. A fresh disk read returned `HeavyWork (local)`, while the sidebar remained `MediumWork (local)` until `/reload`.
- An earlier event naming `profile-pin.json` caused the expected snapshot change and fullscreen render. The existing deterministic tests and temporary real-watcher fixture observed target basenames, so they missed this event-only case.
- Previous feature history: `odd/tasks/effective-profile-status.md`, especially review follow-up T8–T10.
- Current branch: `fix/effective-profile-status` at `fb9ad2a2`; starting working tree clean. No push, PR, real profile-store mutation by the agent, or live-process instrumentation is in scope.

## Scope and approach

- Preserve filtering of unrelated watched-directory events; recognize only the atomic sibling temporary filenames produced for watched `profiles.json`, `profile-pin.json`, or `profile.json` targets where applicable.
- Schedule a bounded refresh after the atomic replacement is complete; cover the case where the only event arrives before the rename and no final-target event follows. Avoid repeated Git resolution or unbounded polling.
- Keep existing null-filename, direct-target, late-directory, source-transition, and watcher-disposal behavior.
- Use one work unit for implementation and its regression tests. Forecast: roughly 100–220 authored changed lines, under the ~400-line review planning heuristic; delivery strategy `ask-on-risk`. The task has two non-trivial edit surfaces, so delegate one writer.
- TDD: enabled by the user-approved plan for this regression (write a deterministic failing reproduction first, then implement); focused runner `node --experimental-strip-types --test tests/gentle-shell.test.ts`. Full runner: `node --experimental-strip-types --test tests/*.test.ts`. Typecheck: `node scripts/check-types.mjs`. RDD switch: off, confirmed by `gentle-ai review mode status` on this branch.
- Delivery: the user explicitly authorized one local work-unit commit for this fix, tests, and task record; do not push or open a PR.

## Tasks

- [x] T1 — Add deterministic temp-only and pre-rename-event regressions, implement a target-scoped bounded refresh, and pass focused tests, typecheck, and diff check. Route: delegated writer for `extensions/gentle-shell.ts` and `tests/gentle-shell.test.ts`; final RED/GREEN also covers a second distinct-UUID write near retry exhaustion. Included with this task record in the local work-unit commit; SHA recorded in the Engram mirror.
- [x] T2 — Run the complete repository test suite and validate the updated fullscreen sidebar in a fresh `/reload` with a user-initiated profile change. Route: independent delegated command verification and parent-coordinated live check; user confirmed the sidebar now follows profile changes without another reload.

## Acceptance criteria

- An atomic pin or global-profile write updates the effective profile and fullscreen sidebar even if `fs.watch` reports only the matching temporary basename.
- An event before the rename still produces an update after the completed replacement, within a bounded retry policy.
- Unrelated temporary files and names do not refresh the profile; direct target and null events continue to work.
- No profile resolution is added to sidebar digest/render; timers and watchers are disposed safely; no unbounded retry or unrelated filesystem activity.
- Focused tests, typecheck, full suite, and `git diff --check` pass; live Pi verification is reported distinctly from simulated tests.

## Progress

- T1 complete: deterministic regressions cover temp-only pin/global writes, delayed replacement, irrelevant temp names, null/direct target interleavings before debounce and during active retry, bounded retry reads, exhaustion, change cancellation, disposal, and a second distinct-UUID write near exhaustion. Each distinct temp filename receives a finite retry window; same-name bursts coalesce with one cancellable timer. A rename completing after its bounded window still needs another event or explicit refresh.
- T1 RED/GREEN sequence: delayed rename 114 passed/1 failed → 115 passed; stale retry after direct event 115 passed/1 failed → 116 passed; pre-debounce direct/null 116 passed/2 failed → 118 passed; duplicate active retry 118 passed/2 failed → 120 passed; second distinct-UUID write 120 passed/1 failed → final 121 passed, 0 failed. `node scripts/check-types.mjs` reported 195 recorded diagnostics with no regressions; `git diff --check` passed. The user subsequently approved a local work-unit commit without push.
- T2 final independent verification: `node --experimental-strip-types --test tests/*.test.ts` — 3362 passed, 0 failed, 38 skipped; `node scripts/check-types.mjs` — 195 recorded diagnostics, no regressions (4 improved pairs); `git diff --check` passed. The independent verifier confirmed all earlier findings fixed and found no other material defect in scoped code. Parent spot check passed. Source/test authored diff: 299 lines (additions plus deletions), below the ~400-line delivery review heuristic.
- T2 live Pi check: after `/reload`, the user changed the profile and confirmed the fullscreen sidebar now updates correctly without another reload. This is user-observed live behavior, distinct from the deterministic automated tests. macOS-specific execution was not available; the 38 suite skips remain. The user approved a local commit of this work unit; its exact SHA is recorded in the Engram recovery mirror. No push is authorized.
