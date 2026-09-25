# Shell effective profile (#1176)

## Objective

Show the repository-effective subagent profile in the fullscreen shell header and Status → Project → Profile: global name alone, or the winning pin name with `(Local)` / `(Repo)`. The implementation plan is `work-items/active/fix/1176-shell-effective-profile/index.md` (locally ignored).

## Scope and constraints

- Work only on branch `fix/1176-shell-effective-profile` in the current worktree; do not create a worktree.
- Evolve `createActiveProfileReader()` instead of adding a parallel reader; preserve its unsessioned global behavior and atomic-replacement detection. Reuse `resolveProfilePin()` for local/repo precedence, off the per-frame render path. Refresh bound-session cached display at session start and with bounded latency for internal/external edits; dispose cleanly on session replacement/shutdown.
- Preserve project code and documentation style. Do not run Prettier or markdownlint on implementation artifacts, per user instruction.
- The fix (implementation + regression tests + product docs) must remain at or below 400 changed lines, additions plus deletions. Do not sacrifice tests/readability to hit the cap; stop and report if a cohesive solution cannot fit.
- No changes to routing, the profiles panel, orchestrator selection, or compact bar. No push or PR without user decision.
- Authorized expected code surfaces: `extensions/gentle-shell.ts`, `tests/gentle-shell.test.ts`, `docs/readme-reference.md`; reopen scope before touching others.

## TDD and verification

- ODD TDD mode: unknown; `openspec/config.yaml:strict_tdd` is SDD-specific, not proof of ODD mode. Use ordinary behavior-focused tests, recording failures before fixes when feasible; do not claim strict RED/GREEN without observations.
- Focused runner: `node --experimental-strip-types --test tests/gentle-shell.test.ts tests/profile-pin.test.ts`.
- Closure checks: `pnpm run typecheck` and `pnpm test`; no Prettier or markdownlint on fix artifacts.
- Review switch: on (global), read via `gentle-ai review mode status`; use the native candidate lifecycle at the work-unit commit boundary.
- Forecast: 330 changed lines plus 70 contingency, maximum 400 for the fix. Delivery strategy: ask-on-risk; one feature-branch work-unit commit; no PR automatically.

## Task

- [ ] P1176-1 — Extend the existing profile reader to resolve the effective profile off-render, keep session lifecycle refresh bounded, cover global/local/repo precedence, transitions, replacement, disposal, and frame cost with regression tests, update product documentation, run focused/full/type checks, and record the work-unit commit.
  - Route: delegated `gentle-ai-worker` (3 non-trivial files to change; multi-file write trigger).
  - Acceptance: both fullscreen surfaces show `name`, `name (Local)`, or `name (Repo)` as appropriate; same-name source transitions redraw; invalid/stale pin layers fall through; no filesystem/Git in repeated digest/render; external edits appear after bounded refresh; no leaked refresh across sessions; compact bar and routing unchanged.
  - Evidence: worker focused tests 126 passed; `pnpm run typecheck` passed with 195 baseline diagnostics and no regression; `pnpm test` passed (3,362 passed, 38 skipped). Independent verifier reran focused tests: 126 passed, 0 failed; `git diff --check` passed. Parent spot check `git diff --check` passed. Implementation diff: 187 additions + 20 deletions = 207 changed lines (before task document), below 400. Commit: pending explicit approval. Assessment/review: initial native assess unavailable while this task file remains untracked; treated as high verification risk, independent verifier completed.

## Progress

- 2026-09-25: implementation authorized on existing branch, no new worktree; task record created before source writes. Engram mirror pending: mem_save returned `session has already ended`; local file remains authoritative until resynchronized.
- 2026-09-25: reader, polling, regression tests and docs implemented. Polling regression triggers captured 2-second callback deterministically; wall-clock timing not measured. Verifier noted cached Git identity would not reflect a repository change mid-session; the defined scope is the worktree identity bound at session start, refreshed on session replacement. No tests failing; no formatter or markdownlint run.

## Next step

Await explicit authorization to create the work-unit commit. Then assess the committed candidate and follow the native review route. Do not check off P1176-1 until candidate handling and verification are recorded; do not push or create a PR.
