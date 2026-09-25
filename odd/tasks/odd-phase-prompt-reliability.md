# ODD phase prompt reliability

## Objective and problem
The primary Gentle Shell prompt must show the explicitly reported ODD phase, rather than the generic `working…` fallback, and phase reporting must not add a noisy transcript card. Independent Pi extension loaders currently duplicate the module-local registry; the phase tool also displays an internal success result.

## Why and authorized scope
The user reported both behaviors, authorized their correction, and selected one pull request for both. Authorized delivery target: `Gentleman-Programming/gentle-shell`, base `main`, using the current `gh` session. Reference the approved, closed feature issue with `Refs #1438` (nonclosing). No unrelated cleanup, remote environment access, or release.

## Constraints and acceptance
- Preserve per-session phases, primary/child process isolation, immediate redraw, and fallback when no phase exists.
- Suppress only the routine successful phase-report transcript UI; errors must remain visible or recoverable. The prompt label itself stays visible.
- Deterministic regression tests for both behaviors; relevant checks and CI before merge.
- Changes stay in reviewable work units with tests alongside behavior; target branch `fix/odd-phase-loader-registry` was based on freshly fetched `main` at `842301779`.

## Checklist
- [x] T1 — Share the explicit ODD phase registry across independent extension loaders and test the real reporter-to-prompt path. Route: delegated direct writer (multiple non-trivial files and preparatory reading). RED generic `working…`, GREEN `authorizing…`; isolated-HOME focused suite 230/230 on current base. TypeScript baseline and T1 both report the same 188 errors (0 added, 0 removed). Native workspace review `review-788c4fb73633ac1d` approved and acknowledged for the pre-commit candidate. Work-unit commit: `87993a9a94f984f653f26f8bda740ff1fd13946d`. Committed assessment: medium, `under_budget`; pending review slice remains anchored at `842301779`.
- [ ] T2 — Hide routine successful `gentle_odd_phase` tool UI while retaining state updates and visible failures; add rendering/behavior tests. Route: delegated direct writer (preparation and multi-file behavior/test). Observe RED/GREEN where runnable; commit as a separate work unit, record SHA.
- [ ] T3 — Prepare issue-linked PR with exactly one `type:bug` label, verify required target CI, then merge under the user's explicit authorization. Route: inline delivery operations and optional bounded verification worker; record PR and merge evidence.

## Delivery and checks
Strategy: `ask-on-risk`; forecast roughly 180 authored changed lines excluding generated files, below the ~400-line review workload advisory. Work-unit commit boundaries: T1 and T2. Run isolated-HOME focused tests (the default HOME has a known unrelated Vim INSERT test contamination), relevant typecheck and required CI. The direct local TypeScript binary reports the same 188 errors on archived `main` and the T1 checkout; repository-wide typechecking still fails, with no new diagnostics from T1. No source-mutating formatting after review freeze. For each commit under RDD, assess against previous reviewed boundary and follow native due transitions; previous workspace review covered T1's exact bytes but not the later committed range.

## Progress and next step
T1 committed and verified with baseline-equivalent TypeScript failures. T2 is next; T3 delivery pending. Review slice remains pending under the medium-risk budget from `842301779`. Mirror topic: `odd/odd-phase-prompt-reliability/tasks`.
