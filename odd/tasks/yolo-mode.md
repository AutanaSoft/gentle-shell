# Guarded YOLO Mode

## Objective
Provide a human-activated `/yolo on|off|status` command that removes routine development and delivery permission questions within the authorized task, while retaining destructive-operation safeguards.

## Problem and why
Repeated commit/push/PR confirmations interrupt ordinary work. Existing shell safeguards do not recognize database DROP/TRUNCATE, so preserving them alone does not meet the requested safety boundary.

## Authorized scope and constraints
- Isolated worktree: /Users/alanbuscaglia/work/gentle-pi-worktrees/yolo-mode
- Branch: feat/yolo-mode; starting revision: 290c0dc1352d65ed134bcf07187e81be955645a7.
- Session-only, default off; explicit command activation, reversible, clone/session bound. No persisted global autonomy switch.
- Ordinary commits, non-force pushes and PR preparation may proceed without repeated permission only inside the established task/repository/destination.
- Preserve explicit user restrictions, genuine unresolved product decisions, destination/credential ambiguity, privacy protection, explicit configured blocks, sensitive paths, destructive Git and recognized data-loss guards.
- Never auto-answer provider consent, maintenance/recovery authorization or opaque-token questions. Do not change RDD.
- Parent retains delivery authority; children receive bounded work scope and fail-closed destructive guards, never independent YOLO activation.
- Shell detection is defense-in-depth, not a sandbox or an all-tools safety guarantee.
- No remote publication, PR creation, release, merge, dependency/config changes or edits to unrelated worktrees are authorized for this feature.

## Tasks
- [ ] T1 — Add shared recognized data-loss guards to primary and delegated execution.
  - Status: in_progress.
  - Route: delegated direct; preparation/mapping and multi-file writer triggers.
  - Outcome: recognized destructive SQL and broad data deletion require fresh primary confirmation and block headless children; preserve existing hard-deny/config precedence.
  - Acceptance: ordinary commands remain unchanged; mixed commands cannot hide recognized destructive operations; cancellation/no UI fail closed; child extension loading is tested.
  - Risk: high (permission/data-loss boundary).
  - Checks: observed test-first RED/GREEN; focused guard/agent regressions; check-only runtime module validation; typecheck ratchet; independent/native verification according to assessment.
  - Commit: pending.
- [ ] T2 — Implement and document session-scoped YOLO command, policy and visible state.
  - Status: pending.
  - Route: delegated direct; multi-file writer and preparation triggers.
  - Outcome: on/off/status/toggle, lifecycle isolation/reset, active-only structured prompt, narrowly authorized routine push, status/widget and palette entry.
  - Acceptance: default/off unchanged; no activation from child or arbitrary tool arguments; no unrelated clone leakage; off/reset remove instruction/UI; destructive/config/provider boundaries remain.
  - Risk: high (authorization boundary).
  - Checks: observed RED/GREEN; command/policy/lifecycle/prompt/visibility tests; applicable focused/full/package checks; parent structural spot check; safe runtime smoke when available.
  - Commit: pending.

## Delivery and review workload
- Strategy: single-pr; user explicitly authorized size:exception (overrides the earlier chain selection).
- Forecast: approximately 600 authored changed lines, generated runtime excluded; safety plus mode are separate coherent work units.
- Running count: 0; no commits yet.
- One future PR contains both T1 safeguards and T2 YOLO mode, with size:exception. Local work-unit commits remain separate. No remote action is authorized by this choice.
- Native review is enabled by global policy; each candidate is its own work-unit slice, not the accumulated branch. T1 lineage: review-27caafa134c98a95 (high; four provider-selected lenses).
- No meaningful test-first exception is currently known; deterministic unit/runtime tests are applicable.

## Evidence and progress
- Read-only explorer mapped existing guards, structured prompt hook, session permission identity, child extensions and commands.
- Confirmed safety gap: database DROP/TRUNCATE are not in existing classification.
- Pi SDK docs and related examples read by explorer; source spot check confirms confirmCommand evaluates policy before fresh UI approval.
- Linked worktree initially clean. Two untracked ODD documents in the original tree remain untouched.
- Existing main dependencies may be shared via a local ignored node_modules symlink; no install or network required.

- T1 writer paused before edits because the parent supplied incorrect generated destinations for an unnecessary normalization command. Parent inspected scripts/build-runtime-modules.mjs: all eight inputs are outside T1 and remain unchanged; remove build:runtime-modules from required commands, retaining check:runtime-modules. No extra edit surfaces or product authorization are needed.

- T1 source/tests/docs implemented: 378 authored changed lines. Observed RED, then focused GREEN (255/255). Package resource validation passed (155 resources).
- Remaining primary regression run failed five fixtures under inherited GENTLE_PI_AGENTS_CHILD=1; this is not yet claimed resolved. pnpm tried implicit package-manager/dependency installation and aborted; no installation is authorized. Parent confirmed shared dependencies and worktree symlink remain intact.
- Corrected verification uses env GENTLE_PI_AGENTS_CHILD=0 for primary-session regression fixtures and direct node scripts for runtime/typechecking (no install).
- Native ASSESS could not classify untracked scope; it returned unassessable/high-equivalent and requires independent verification. No review authority has been started.

- Independent T1 commands passed (424 tests, runtime/typecheck/package checks, diff whitespace), but source tracing found wrapper option arity, quoted WHERE and separator-provenance bugs; T1 remains incomplete.
- Native four-lens review corroborated four severe deterministic findings: R1-quoted-separator-bypass; R3-double-quoted-shell-payload; R3-quoted-where-identifier; R3-separator-provenance. One correction plan captured with 189 diff lines maximum; transaction awaits corrected candidate. No authority acknowledged and no commit made.

- Bounded correction completed: 86 additions + 14 deletions = 100 diff lines against frozen candidate (limit 189). Regression RED observed (17 intended failures), final GREEN 446/446, runtime/typecheck/package/whitespace checks passed.
- Native targeted validator approved corrected T1. Exact acknowledgement succeeded: authority burned for target sha256:a75df5c21980f655dbefc3ffb0f694e69ad53cd8ed94aa49b642748a1c65b48d, consumed revision sha256:b0c03b1b717fad52bf64963bd3a3818e47ae7fad8cac6ad39d048014ad298810. No further lifecycle call for this candidate.
- Native informational findings R2-token-provenance and R2-wrapper-arity did not block or reopen review; corrected related source remains documented.
- Independent post-correction verifier muocp6wg-7-jwsu passed all required checks: 446 tests, runtime sources, typecheck ratchet, package resources and diff whitespace; no residual blockers in the specified defect classes.

## Next step
Close verified T1 with its local work-unit commit, record identity and begin T2. Full suite, packing and real runtime smoke remain scheduled with T2; no remote publication.
