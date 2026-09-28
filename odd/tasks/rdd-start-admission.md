# RDD START admission

## Intent and authorization
Fix proven Pi-side admission defects related to gentle-ai #2196 and #4924 without weakening frozen-candidate integrity. User authorized local corrections/tests and explicitly approved adding status:approved to both issues; both labels were added. No push, PR, merge, runtime install, real-authority maintenance, or automatic permission/configuration repair is authorized.

Repository: gentle-pi, baseline b27bd328b95e83967ffc23f62b76e77901b91130. Dedicated worktree: /Users/alanbuscaglia/work/gentle-pi-rdd-start-admission. Branch: fix/rdd-start-admission-isolated. User explicitly authorized worktree creation and migration after concurrent edits were detected in the original worktree. Only four T1 source/test files, its documentation paragraph and this tracker were copied; source hashes stayed unchanged. Original copies remain preserved; no cleanup or unrelated profile changes were included.

## Evidence and constraints
- Native explicit STATUS tree-valued START replay passes existing isolated tests.
- Pi isolated probes: unchanged tracked symlink with core.symlinks=false fails; true passes. Parent0777 fails privacy check;0700 passes. Real commit resolves; its tree does not.
- Inspect does not materialize the view; START does. Whole-tree entries are checked.
- No live Windows or complete Pi facade E2E proof yet. Do not claim either from unit fixtures.
- Claude Code, Codex and OpenCode adapters are excluded: audit found no shared Pi materializer.
- Keep symlink target/path confinement, byte integrity, owner checks and user commit-ref validation. Never expose arbitrary underlying error messages or private filesystem paths.
- Open PR #671 already proposes committed symlink materialization; reconcile rather than duplicate. PR #942 concerns selection-binding diagnostics, not owner preparation; avoid its unrelated scope. PR #1183 concerns START mode validation; avoid unrelated changes.

## Tasks
- [ ] T1 (checking): Emit bounded actionable owner-parent privacy diagnostics through the facade, preserving refusal and zero authority mutation. Delegated writer: security boundary and multiple non-trivial files. High risk. Add RED then GREEN tests for0777 vs0700 and sanitized diagnostics; existing owner/Windows tests remain passing.
- [ ] T2: Reproduce provider-offered tree selectors through the actual facade test boundary and fix only a demonstrated mismatch. Delegated writer: facade/resolver contract. High risk. Preserve explicit caller selector precedence and reject arbitrary caller tree inputs unless a separately justified contract change is approved. Negative controls for changed/mismatched target and malformed offer.
- [ ] T3: Reconcile PR #671 with current main and implement the smallest safe symlink fix if not superseded. Delegated writer: immutable materialization security. High risk. Cover unchanged tracked links, false/true Git symlink settings, tampering, unsafe targets and unavailable native symlink capability. Do not change user Git settings.

## Verification and delivery
Use test-first for deterministic behavior changes; normalize before final checks. Focused commands: node --experimental-strip-types --test tests/review-candidate-view.test.ts; node --experimental-strip-types --test tests/review-controller-native-routing.test.ts; node --experimental-strip-types --test tests/review-integration-v2-forward.test.ts tests/native-review-cli.test.ts; node scripts/check-types.mjs. Record exact applicability, commands and observed failures/skips per task. Native RDD inspect and candidate consent apply after a normalized work unit; no review status is delivery authority. Independent verification required when native review is unavailable or declined. Source unit completion and commit/delivery status must be recorded separately; writers do not commit.

Forecast: approximately350 authored additions plus deletions across three focused units, subject to scope discovery. Delivery strategy: ask-on-risk; ask once about slicing if forecast exceeds about400. No commit, push, PR or merge has occurred. Commits require explicit user authorization under the active safety rule.

## Progress
Engram mirror pending: this session is bound to project gentle-ai, so the gentle-pi memory write was rejected. Local tracking remains authoritative until a gentle-pi session can synchronize it.
T1 writer completed five tracked files,118 authored diff lines. Observed focused RED then GREEN; candidate tests143 passed/7 skipped, routing tests81 passed, types188 recorded diagnostics/no regressions, diff check passed. Independent verifier repeated224 passed/7 skipped, no type regressions (188 baseline diagnostics,10 improved pairs), but found a second-lstat race that can misclassify an unsafe path as a privacy error; refusal remains closed. T1 is not complete. No live Windows or full Pi E2E proof.
Verification also detected unrelated concurrent model-profile edits. All writers paused; read-only incident mapping identified disjoint hunks. Migration to the dedicated worktree copied exactly T1's118 authored lines and excluded all profile hunks. No original files, configs, refs or authority were removed or reverted. Git created only the new branch/worktree. Tests have not yet been rerun in the isolated worktree.
Native assessment previously was unassessable due undeclared untracked scope, requiring independent high-risk verification. Native review pending for the normalized delivery slice; no commit.
T1 correction: shared checked directory probe now owns privacy classification; focused replacement test observed RED (two probes) then GREEN. Candidate suite145 passed/7 skipped; diff check passed. Routing tests failed before execution (missing @earendil-works/pi-tui); type check unavailable (missing compiler), not source regressions or passes. Independent verification now performs isolated pnpm install --offline --frozen-lockfile --ignore-scripts, then reruns candidate/routing/type/diff checks. No network fallback or source/lockfile modifications authorized.
Next: finish isolated verification, then T2 and PR671 reconciliation before T3.
