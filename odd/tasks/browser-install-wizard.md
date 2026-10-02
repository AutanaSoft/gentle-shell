# Browser installation wizard

## Objective
Install all prerequisites and the normal Gentle Shell stack through a local-browser wizard on Windows, macOS and Linux. The final behavior must match global `gentle-pi` installation and running `gentle-shell` in a terminal.

## Problem and rationale
Current setup requires a usable Node/Pi runtime and Windows native provisioning requires Go. A browser wizard should acquire missing prerequisites, explain installation progress and verify readiness without duplicating the existing provider/companion installation logic.

## Authorized scope and constraints
- User authorized implementation after approving the corrected design.
- Preserve the default `~/.gentle-shell/agent`, existing Engram data/server semantics, shared integrations and existing setup/update ownership.
- Reuse compatible prerequisites and install missing ones, including Pi.
- Prefer pnpm without assuming npm, pnpm, Corepack, Node or Go is already installed.
- `npm:` registry references are allowed; they are not npm executable invocations. Pi's `npmCommand` supports pnpm, but upstream independent `npm exec` remains unverified.
- Do not invent package-manager flags, an npm-impersonating wrapper or a duplicate companion installer.
- No custom product root, separate Engram database/server, credential copying/migration, security exclusions or silent changes to existing installations.
- Use a dependency-free Node local HTTP host and bundled static browser UI. The wizard is temporary; ordinary terminal `gentle-shell` remains the runtime.
- Keep source writes single-threaded. No push, PR, release, remote execution or authenticated remote access is authorized.
- Initial target matrix: Windows/macOS/Linux desktop x64 and arm64; exact supported OS/libc/runtime versions must be validated rather than claimed.

## Delivery and routing
- Branch: `feat/browser-install-wizard`; verified default reference: `origin/main`.
- Development workspace: user-authorized isolated worktree `../gentle-pi-browser-install-wizard` beside the main worktree. This does not change product or Engram installation roots.
- Base/initial review boundary: `7a27c1c008b3922b851da5efb78e4ca4dae6e6b1`.
- Original forecast: 2,350–3,610 authored changed lines; revised forecast approximately 3,040–4,100 after the cohesive T2 security/tests unit exceeded its initial estimate. Counts are additions plus deletions, generated files excluded; the authorized deadline correction was 153 lines before folding into the work unit.
- Running committed authored lines through T4 source: 3,926 (T1 417 + T2 1,041 + T2 ledger 21 + T3 source 1,337 + T3 ledger 15 + T4 source 1,095). This T4 closure ledger is a separate passive commit.
- Last reviewed source boundary: `0d9dac2cc90db922283f40cffa03958ba827fd42`; committed tree exactly matched approved frozen T4 tree `2aba557ebaa015241c998fe6f707f0e8715e30a3`.
- Delivery strategy: `single-pr`, explicitly selected by the user. No chain strategy or tracker applies. Any repository size-exception approval remains a separate future publishing gate.
- No publishing is implied by a delivery-strategy choice.
- Each task uses delegated direct: unfamiliar preparation and two or more non-trivial implementation files trigger a bounded writer.
- Task size around 400 lines is advisory, not a cap. Never compress code or omit checks to meet it.
- Tests first where deterministic expected behavior exists: observed RED, GREEN, then checked refactoring. Report unavailable or non-applicable checks honestly.
- RDD currently on globally; review candidates are work-unit commits or review slices, never checkboxes. Native review does not replace functional verification.

## Tasks
- [x] T1 — Dependency inventory and ordered preflight plan. Status: done; commit `09860c05ee951cdfa85abfb4006c56ca577b28d3`, three independent focused runs passed 21/21, native medium review approved and acknowledged. Route: delegated direct (preparation and multiple non-trivial files). Surfaces: `scripts/installer-preflight.mjs`, `tests/installer-preflight.test.ts`, `docs/install-wizard.md`. Forecast: 250–360 lines. Checks: `node --experimental-strip-types --test tests/installer-preflight.test.ts`; fake inventory/process adapters, no host provisioning.
- [x] T2 — POSIX clean-machine bootstrap foundation. Status: closed for bounded implementation; commit `03e770f75d5ce8a02f16d125b590e41c743c8101`, writer/independent/parent 76/76, native high review approved and acknowledged. Native macOS/clean-machine installation evidence remains an explicit T7 prerequisite, not a T2 support claim. Route: delegated direct. Surfaces: `scripts/bootstrap.sh`, `scripts/installer-downloads.mjs`, `tests/installer-posix-bootstrap.test.ts`, `docs/install-wizard.md`. Initial forecast: 350–550 lines; returned 860 lines before bounded correction, retaining integrity/security tests and docs. Checks: focused Linux-executed POSIX fixture tests, shell syntax and whitespace; integrity, spaces and environment refresh. Native macOS and live installation checks deferred explicitly to T7.
- [x] T3 — Windows clean-machine bootstrap foundation. Status: bounded implementation closed; commit `ffdc7f74e3cbd172a7c2233e40c6807a9bdd4b7a`. Writer/independent/parent each passed 98 tests with 13 unavailable native Windows cases; no failures. Real pinned pnpm archive integrity/format/metadata proof passed. Native review approved and exactly acknowledged, authority consumed; native Windows acceptance remains T7. Route: delegated direct (unfamiliar platform preparation and multiple non-trivial files). Surfaces: `scripts/bootstrap.cmd`, `scripts/installer-downloads.mjs`, optional narrow `scripts/installer-windows.mjs`/`scripts/installer-windows-artifacts.json`, `tests/installer-windows-bootstrap.test.ts`, `docs/install-wizard.md`. Initial forecast: 350–550 lines; ACL/reparse/quoting and integrity regression coverage may exceed this advisory estimate without compression. Checks: portable Windows contract tests plus POSIX/preflight regression, whitespace and explicitly gated native Windows entry tests. Native Windows/PowerShell unavailable locally; no support claim until T7 execution. Go helper remains lazy; T4 first establishes whether the normal planned operation needs Go despite reusable native Gentle AI.
- [x] T4 — Standard installation driver. Status: bounded implementation closed; commit `0d9dac2cc90db922283f40cffa03958ba827fd42`. Writer, independent verifier and parent passed (final 134 tests/121 pass/0 fail/13 native Windows skips); native review approved and exactly acknowledged. Real-machine behavior remains T7. Route: delegated direct. Surfaces: `scripts/installer-runner.mjs`, `tests/installer-runner.test.ts`, `docs/install-wizard.md`. Forecast: 350–550 lines. Checks: focused runner tests; Pi/global package installation via pnpm, normal setup, partial failure and no alternate product roots.
- [ ] T5 — Secure local wizard host and packaged entry. Route: delegated direct. Surfaces: `bin/gentle-shell-install.mjs`, `scripts/installer-server.mjs`, `tests/installer-server.test.ts`, `package.json`, `scripts/verify-package-files.mjs`, `tests/verify-package-files.test.ts`, `docs/install-wizard.md`. Forecast: 350–500 lines. Checks: focused server/package tests; loopback binding, Host/Origin/session authorization, explicit install consent, bounded logs and no arbitrary command/path API.
- [ ] T6 — Accessible browser wizard and terminal handoff. Route: delegated direct. Surfaces: `assets/install-wizard/index.html`, `assets/install-wizard/wizard.js`, `assets/install-wizard/wizard.css`, `tests/install-wizard.test.ts`, `scripts/verify-package-files.mjs`, `README.md`, `docs/install-wizard.md`. Forecast: 450–700 lines. Checks: focused UI tests plus Ego Browser with a fake driver; keyboard, consent, progress, failure/retry and handoff.
- [ ] T7 — Cross-platform acceptance and parity evidence. Route: delegated direct. Surfaces: `.github/workflows/ci.yml`, `scripts/test-installer-runner.mjs`, `tests/installer-acceptance.test.ts`, `docs/install-wizard.md`. Forecast: 250–400 lines. Checks: deterministic matrix, explicit clean-machine native checks, preserved existing installs and parity with standard terminal launch.

## Acceptance criteria
- A supported clean machine can acquire all prerequisites including Pi without manual dependency installation.
- Normal global package ownership and default terminal-launch isolation remain unchanged.
- Engram/shared companion behavior is reused, not duplicated or migrated.
- Mandatory readiness failures never produce a successful result.
- Missing provider authentication is distinguished from installation failure; no paid model request is required for basic readiness.
- Downloads are integrity-verified; installation actions are fixed and explicitly consented to.
- Interrupted/failing steps are recoverable without deleting existing data or exposing secrets.
- Native OS support is claimed only after corresponding execution evidence, not syntax/mock tests alone.

## Verification policy
Risk: high (installers, executable acquisition, shared configuration, local mutation API). Functional focused checks are mandatory; applicable independent verification and native review follow the runtime/controller evidence. Use disposable homes and fake download/process adapters for deterministic tests. No real installs into the operator's home.

Planned closure checks: `pnpm test`, `pnpm run typecheck`, `pnpm run check:runtime-modules`, `node scripts/verify-package-files.mjs`, and `pnpm run test:packed-package`. The last uses real installation/network and requires a side-effect forecast/disposable environment. Typecheck is an existing ratchet, not a zero-diagnostic guarantee.

## Open evidence and boundaries
- Upstream independent `npm exec` cannot be redirected by Pi's `npmCommand`; inspect the exact pinned public contract before asserting an npm-free setup.
- Bootstrap publication URLs, artifact trust/integrity, OS support and elevation behavior need validated implementation contracts; do not invent published artifacts.
- Existing launcher setup dry-run is not a whole-launcher no-write guarantee; preflight must not execute setup or postinstall.
- Browser functional verification remains pending implementation.
- T1 writer observed RED (`ERR_MODULE_NOT_FOUND`), then GREEN/refactor with 21/21 focused tests and whitespace checks passing. Independent verifier also passed 21/21 with no severe deterministic candidate-caused findings. T1 native assessment was medium; its single reliability review approved and exact acknowledgement consumed authority. Full suites, builds, actual installs and packaging checks remain pending.

## Progress and next step
T1–T3 bounded source units are closed with the evidence below. T3 source commit is `ffdc7f74e3cbd172a7c2233e40c6807a9bdd4b7a`, followed by passive closure ledger `82ce7778`. Writer, independent verifier and parent each observed 98 passing tests and 13 unavailable native Windows cases. The integrity-verified published pnpm archive passed the existing parser and pinned metadata checks. Native review was approved and exactly acknowledged. Post-correction RED history remains unknown; current functional GREEN is observed. Native Windows/macOS and clean-machine acceptance remain T7.

The user-authorized isolated development worktree preserves unrelated original worktree changes. Product/runtime/Engram roots are unchanged. T4 local mapping is complete; public acquisition/lifecycle contracts are absent locally. Human authorized bounded read-only official-source research, now routed to `mur2mlxy-l-00gv` after the original research explorer completed with no network tools, before selecting complete dependency and runner behavior. No runner writer, host installation, publishing or extra source correction has been launched.

## Work-unit evidence
### T1 (closed)
- Writer: `muqq4ay0-4-dazo`; authorized files only; 342 authored additions.
- RED: focused test command failed with `ERR_MODULE_NOT_FOUND` before implementation.
- GREEN/refactor: `node --experimental-strip-types --test tests/installer-preflight.test.ts` passed 21/21; writer corrected a setup-action test expectation before final GREEN.
- Writer whitespace: `git diff --check` passed; new-file no-index checks had no whitespace findings.
- Native ASSESS: unassessable on undeclared untracked scope, independent verifier required. INSPECT later declared intended paths and returned ready, no lineage created.
- Independent verification: task `muqqewpj-5-xgbi` passed 21/21 focused tests and whitespace checks, without edits; no severe deterministic candidate-caused findings. Parent spot check reran the focused command and passed 21/21.
- Commit: `09860c05ee951cdfa85abfb4006c56ca577b28d3` (`feat(installer): add read-only dependency preflight`), 417 additions including the feature task document.
- Committed native ASSESS: medium, 4 paths/417 lines, `reviewDue=true` (`slice_budget_reached`).
- Review: `review-eda68029d737a4f8`, reliability capture approved; `acknowledge-approved` returned `native-approved-acknowledgement-completed`, authority burned for target `sha256:062d3e347226b65d79754b215d1b128677da7ef06c434611f4b04a7e793d45a9`.
- First START consent expired without invocation/lineage/mutation; native continuation explicitly allowed fresh START. Second START consent succeeded. No burned authority is reused.
- No claims of native OS install proof.

### T2 (bounded implementation closed)
- Commit: `03e770f75d5ce8a02f16d125b590e41c743c8101`, 1,041 authored lines. Integrity/security fixtures and docs retained as one cohesive POSIX prerequisite unit rather than compressed.
- Final independent verifier: `muqu6ajy-a-8eae`, 76/76 (55 POSIX + 21 preflight), no failures/skips/cancellations, 26.156s; syntax, staged/worktree whitespace checks passed. Source/docs/tests stable; ledger MM parent-owned.
- Production deadline cases: shell 10,025.533ms; Node 15,061.966ms; neither outer guard fired. Direct PIDs reaped, owned cleanup, unrelated-file preservation asserted. Normal nonzero tar failure covered.
- Parent spot check after acknowledgement: 76/76, 26.133s; `sh -n` and post-restaging `git diff --cached --check` passed. Full staged tree equality proved commit preserved reviewed bytes.
- Native: high risk, 4 lenses; `review-5cbf4ce0e04bf1de` approved, `native-approved-acknowledgement-completed`, authority burned for the exact frozen workspace target. No STATUS issued after burn.
- Nonblocking advisories: `R2-engine-contract` (`scripts/bootstrap.sh:24-25`), `R3-001` (`scripts/installer-downloads.mjs:122-134`), `R3-002` (`tests/installer-posix-bootstrap.test.ts:23-24`). These do not open correction or invalidate approval; separate later work only, no automatic acceptance/fix.
- Limitations: Linux fake-acquisition fixtures only; native macOS, clean-machine/network acquisition, full suites/build/package checks, forked-descendant cancellation remain unproved. Direct non-forking probe guarantee only. Missing T5 wizard entry intentionally prevents real bootstrap acquisition.

### T3 closure evidence
- Final writer self-check: `muqz9ufr-h-dlq0`, 111 total/98 passed/13 native skips, zero failures, 26.140s; shell syntax and whitespace passed, all seven hashes stable.
- Independent verifier: `muqyo9ni-g-ocro`, same counts, 26.014s; no confirmed severe candidate-caused finding. Thirteen native Windows callbacks are implemented but unexecuted on Linux.
- Actual pinned pnpm archive: `muqziidu-i-sv6f`, one HTTPS GET, 4,223,291 bytes; exact SHA512 matched literal and repository pin before `readWindowsPnpmArchive` accepted 448 entries. Metadata `pnpm`/`11.1.1`/`>=22.13`/`bin/pnpm.mjs` matched. No extraction or execution; owned temporary directory cleaned; source/index unchanged.
- Post-correction RED history remains unknown after worker timeout; functional GREEN is observed, not reconstructed TDD evidence.
- Native Windows execution, whole-entry certification, clean-machine installation and remaining feature checks are still pending; they are explicit T7 acceptance gates, not a claim of Windows support.
- Parent spot check: 111 total/98 passed/13 skipped, zero failures, 26.104s; shell syntax/whitespace passed before staging/freezing.
- Native review `review-2aa665d2b4350300`: controller-selected medium consolidated `review-reliability`, approved on last admitted event; exact acknowledgement returned authority `burned` for target `sha256:e6a787a8f21dd68e9b071041a5289bf035491e2d5f73691509fe4c55ac3cdd07`, consumed revision `sha256:5d27b806de346232f89f5864168dfe15903ddab9d7d7b7727ec044ae4f5fa0bb`. Native ASSESS reported candidate consumed, derived closed, reviewDue false. No further independent verification was required by that plan; the prior independent proof remains recorded.
- Source commit `ffdc7f74e3cbd172a7c2233e40c6807a9bdd4b7a`: staged and committed trees matched frozen `4e227bc619d1c8825b78d65613f9adf9768f2312`; seven files, 1,337 authored diff lines. Native medium classification does not replace installer high-risk functional checks, which passed as above.
- Native advisory `R3-archive-evidence`, `docs/install-wizard.md:307-310`, informational/non-blocking; receipt stands and no correction/re-review is offered. Separately follow up the stale artifact-evidence wording; recorded actual upstream artifact proof does not establish CLI or native Windows readiness.
- Next: T4 read-only contract mapping before bounded runner implementation. No push, PR or host provisioning authorized.

### T4 local mapping and decision gate
- Explorer `mur18ury-j-eq2v` completed read-only mapping in the isolated root; CodeGraph initialized there, bounded fallback after unsuccessful symbols. No source/task writes, tests, installation or network. Injected tracked project skills loaded; ignored local registry absent, not recreated.
- Existing setup owns companion installation, state restoration and cleanup. Use its public CLI, not internal functions or a duplicate component installer.
- Native-path existence is not provenance proof (`bin/gentle-shell.mjs:520–548`); package-local integrity resolver accepts a development override before native verification (`runtime/gentle-ai-binary.mjs:272–306`). An override cannot establish package-native readiness.
- Manual setup does not record automatic provisioning marker (`bin/gentle-shell.mjs:944–956` vs `:1160–1175`); ordinary auto-setup warns and launches on failure, so launcher exit alone does not prove installation readiness.
- Windows installer resolves Go before source-bundle reuse (`scripts/gentle-ai-installer.mjs:630–636`). Package-native reuse can avoid that operation, but temporary agent-home package lifecycle requirements remain unknown.
- Child-only PATH is not fresh-terminal readiness. Preserve existing configured homes and pnpm-global ownership; do not assume npm global layout. POSIX and Windows pnpm handoff differ.
- Requested research: official Gentle AI4.0.0 source commit `ff77164d4f56f1665b22fb6fac51c2ccbb769400`, Pi1.0.0 and0.99.1 acquisition contract, pnpm11.1.1 lifecycle/global/bin/PATH behavior. Read-only public sources, no credentials, executable downloads, installation, provisioning or source writes. Human selected `authorize_t4_public_contracts`; research explorer `mur2j43y-k-8l0s` completed tool-blocked (0 GETs/0 bytes); one read-only HTTPS-capable verifier fallback `mur2mlxy-l-00gv` is running. Budget: at most 20 public text GETs/10 MiB total/60 seconds per request; no executable artifacts, installs, credentials or source writes. Completion/evidence pending.
- Original T4 narrow surfaces remain `scripts/installer-runner.mjs`, `tests/installer-runner.test.ts`, `docs/install-wizard.md`. Proposed prerequisite/bootstrap/integrity/marker/PATH expansions are not yet approved or implemented. Focused test-first command after safe design: `node --experimental-strip-types --test tests/installer-runner.test.ts`.

- T4 research progress (not closure evidence): verifier reports 16 authorized GETs/1,453,761 UTF-8 bytes. Tool output truncation created harness-owned `/tmp/pi-bash-b74d2e010234e8a0.log`; no intentional repository/temp writes. Leave spool untouched. Finish with at most four remaining requests, compact <=100-line/8-KiB command output, exact source excerpts and final accounting; unseen truncated passages remain unproved. No scope/budget extension or implementation implied.

- T4 acquisition budget exhausted: research reports 20 GETs/1,666,417 UTF-8 response-body bytes, including two Pi source refetches. Pi runtime array command/pnpm prefix-install behavior and independent Gentle AI `npm exec gentle-engram@latest` were inspected, exact citations pending final handoff. Latest pnpm setup docs mix v11 and since-v11.18; historical 11.1.1 global/lifecycle closure remains unavailable. Prefer pnpm does not prohibit genuine npm but does prohibit assuming it already exists. No further retrievals, implementation, tests or log operations; final handoff pending.

### T4 final research disposition
- Final actor `mur2mlxy-l-00gv` completed 20 GETs/1,666,417 UTF-8 response-body bytes; no budget remaining. No implementation/tests/installations/intentional source writes. Harness spool untouched. Full cited evidence preserved in Engram topic `installer/t4-public-contract-findings` (21361).
- Verified Pi1.0.0/0.99.1 runtime array-command and pnpm-prefix argv do not establish product-global installation. Metadata declares Node>=22.19.0; stricter existing bootstrap minimum24.3.0 remains unchanged. Agent-home managed package ownership is preserved.
- Verified Gentle AI4.0.0 adapter builder adds independent `npm exec --yes --package gentle-engram@latest -- pi-engram init`. Actual reachability/policy/executor/error propagation remains unproved; do not label construction as unconditional successful normal-setup execution.
- Historical pnpm11.1.1 global/lifecycle/PATH behavior, trustworthy genuine npm availability/acquisition, native setup lifecycle/compiler needs and clean-machine acceptance remain unresolved. No complete T4 design or ready-looking scaffold accepted.
- Parent state check: local Node v24.18.0, feature branch intact, only task ledger modified. This runtime meets declared Pi/pnpm requirements but is not fresh-machine acquisition proof.
- Recommended single next gate: explicitly authorized disposable pnpm11.1.1 fixture validation (integrity-verified archive; offline synthetic packages; no real home or real product installation), plus narrowly bounded official Node/npm distribution and pinned Gentle AI execution-flow source reads. This would address concrete missing facts, not establish Windows/macOS/T7 acceptance. No such experiment or additional reads have been launched.

### T4 disposable validation authorization
- Human selected `authorize_t4_disposable_validation`; one <=10-minute laboratory run now delegated to `mur3ceex-m-b88x`.
- One public pnpm11.1.1 archive GET <=32MiB; literal and repository SHA512 must match BEFORE processing/extraction/execution. Verified CLI may run only against trusted synthetic no-dependency fixtures in owned temporary HOME/cache/global/store/config and offline mode.
- Additionally <=6 textual official GETs/2MiB total from nodejs.org, public GitHubnodejs/node and the fixed Gentle AI source commit, to inspect genuine npm distribution and actual init execution/failure policy. No automatic extension, retry loop or fetched research-code execution.
- No real product installation, actual HOME/PATH/profile/config or credential access, security/lifecycle bypass, source changes, native platform claim or publishing. Clean only owned laboratory; existing harness spool untouched.
- Outcomes remain pending. Parent bookkeeping may update only this ledger/mirror; source stability evidence must distinguish those known ledger transitions from executable changes.

### T4 disposable validation result (blocked)
- Actor `mur3ceex-m-b88x`: one HTTPS GET/4,223,291 bytes; literal and repository SHA512 matched before parser/extraction. Existing bounded parser accepted448entries. No CLI or fetched research text executed; zero of six text requests used.
- The validation harness assumed `package/dist/pnpm.cjs` was present and exited1 at `verified bundle source unavailable` in378ms. This is an incorrect test-harness assumption, not a pnpm compatibility or installer finding.
- Newly owned temporary extraction removed successfully in finally; tracked/nonignored byte aggregate, index and porcelain status identical before/after. Parent ledger was already modified in both snapshots. Existing harness spool unread/untouched.
- All CLI/global/lifecycle/PATH/Pi-prefix tests and exact Node/npm/Gentle AI execution-flow source reads remain unverified. T4 is not done; no source writer/commit/native-review candidate exists.
- The authorized single experiment has ended; its one archive GET is consumed. No automatic retry/extension permitted. Proposed single repeat would derive the declared `bin/pnpm.mjs` entry and imports from verified metadata/inventory, never assume a dist path. Await human repeat-or-pause decision before any new retrieval/execution.

### T4 corrected repeat authorization
- Human selected `authorize_t4_corrected_lab_once`; continued the prior verifier context as new task `mur5mscy-n-hwz5`. No duplicate live experiment exists.
- One fresh <=10-minute bounded run with one pinned archive GET<=32MiB/SHA512-before-processing-execution, offline private synthetic fixtures, and <=6 official text GETs/2MiB; original safeguards unchanged. No third automatic attempt.
- Derive actual `bin/pnpm.mjs` entry, prefix normalization and imports from verified package metadata/entry inventory, not an assumed dist filename. Independent authorized source reads can still return evidence if the CLI portion is blocked, unless safety requires stopping.
- No real installation/home/PATH/config/credential/source/publishing changes; cleanup own temp only, old harness spool untouched. Outcome pending; previous failure remains a harness failure, not a pnpm defect.

### T4 corrected repeat result and stop
- `mur5mscy-n-hwz5` finished semantically blocked (shell exit0),1,505ms. Scanner classified every quoted relative path as mandatory; absent `../lib/pnpm` was not shown reachable on normal execution. Harness-preflight limitation, not pnpm incompatibility. No extraction/CLI execution in this repeat; all CLI/global/lifecycle/Pi-prefix/bin/PATH checks skipped.
- Archive integrity and bounded parser passed448entries; parser preserves `package/`. Verified metadata entry `bin/pnpm.mjs` references existing `package/dist/pnpm.mjs`. Do not infer required modules from all string literals.
- Five GETs/4,272,724 response-body bytes (archive4,223,291 + text49,433). Exact Node24.21.0 source includes npm11.19.0/npm+npx mappings and conditional npm packaging; this is source proof, not actual platform bundle proof. Pinned Gentle AI builder/runner facts reconfirmed but mandatory call flow/error policy remains unknown. Exact citations preserved under `installer/t4-corrected-lab-result`.
- Owned temp cleaned; nonignored source bytes, index/status and parent ledger stable; old harness spool untouched. No installation/source/profile/native acceptance claim.
- Both explicitly authorized experiments have ended. No third run, new GET, source writer or automatic correction authorized. T4 is blocked; stop experiments and redesign the validation gate using control-flow-aware or direct bounded execution semantics rather than another string-scanner retry. No fresh execution or budget extension has been requested.

### T4 redesigned validation gate (proposed, not authorized or executed)
Root cause of both failed labs: the harness tried to predict required files by static inspection instead of observing execution. The redesign removes all static dependency prediction.

Preconditions (only these):
1. One pinned archive GET; literal and repository SHA512 match before parsing.
2. Existing bounded parser accepts the archive; extract every accepted entry under an owned private lab directory (`package/` prefix mapped to `<lab>/pnpm/`).
3. `package.json` declares name `pnpm`, version `11.1.1` and `bin.pnpm = bin/pnpm.mjs`, and that file exists. Nothing else is predicted.

Isolation, asserted by observation before any mutation:
- `env -i` with lab-owned HOME, XDG config/cache/data/state, PNPM_HOME, `SHELL=/bin/bash`, minimal PATH; registry configured to an unreachable loopback address as defense in depth; lab cwd with no ancestor `package.json` or `packageManager` field.
- Run `node <lab>/pnpm/bin/pnpm.mjs --version` directly (`shell:false`, 60-second SIGKILL deadline, bounded output). Expect `11.1.1`; any runtime import failure is an observed pnpm result, not a harness guess.
- Observe `root -g` and `bin -g`; stop before mutation unless both resolve inside the lab.

Observed checks, with an explicit dependency graph (a failed step skips only its dependents):
- A: `pnpm pack` of a trusted local fixture (own bin plus postinstall that writes a sentinel inside the lab only).
- B (needs A): `add -g <tgz> --offline`; then `list -g --depth 0 --json`, run the installed bin from `bin -g` directly, and record whether the postinstall ran, was skipped or warned under default policy. Skipped never counts as ready.
- C (needs A): Pi's exact verified argv `install <tgz> --prefix <lab>/pi --config.auto-install-peers=false --config.strict-peer-dependencies=false --config.strict-dep-builds=false`, then `uninstall <name> --prefix <lab>/pi`.
- D (independent): `pnpm setup` with lab HOME/SHELL; diff only lab profile files, then `env -i HOME=<lab> bash -ic 'command -v pnpm'` as Linux-bash-only fresh-shell evidence.
- E (independent, text only): up to 5 public GETs (<=3 MiB) at Gentle AI `ff77164d4f56f1665b22fb6fac51c2ccbb769400`: one tree listing, then only files that consume `InstallCommand`, to establish reachability and StopOnError policy for the Engram `npm exec` step.

Hard limits: <=10 minutes total, one archive GET <=32 MiB, no retries, no mid-run procedure changes, owned cleanup in finally, repository/index/status stability asserted, existing harness spool untouched. Evidence is Linux-only; no Windows/macOS or real-installation claim.

### T4 observed lab result (blocked at isolation gate)
- `mur6c1an-o-5qc5`: archive GET, pin, SHA512-before-processing, parser (448 entries), metadata and ancestor checks passed. `node <lab>/pnpm/bin/pnpm.mjs --version` printed `11.1.1` under Node v24.18.0 with no import errors: the static-prediction failures are resolved.
- `root -g` and `bin -g` exited 1: pnpm 11.1.1 requires the global bin directory `$PNPM_HOME/bin` on PATH; the harness added `$PNPM_HOME`. Harness error, not a pnpm defect. A–D skipped before any mutation.
- Product implication for T4: the runner and terminal handoff must put `$PNPM_HOME/bin` (not `$PNPM_HOME`) on PATH, and preflight `globalBin.onPath` must check that directory. Current installer scripts do not reference `PNPM_HOME`.
- Step E: `internal/agents/pi/adapter.go:285` defines `InstallCommand`; `:297` returns the independent `npm exec` Engram step; `internal/pipeline/orchestrator.go:9-11` `WithFailurePolicy` sets the apply policy, whose default lives in unfetched `runner.go`. The `InstallCommand` consumer remains unknown.
- 6 requests/4,796,977 bytes; lab cleaned; index/status/HEAD stable; spool untouched. The verifier correctly declined a stop-hook review START on the parent's passive ledger.
- Remaining blocker: unobserved A–D and the Engram step failure policy. Proposed single corrected run: identical procedure with PATH `<PNPM_HOME>/bin:/usr/bin:/bin`, plus up to 3 text GETs (runner.go and InstallCommand consumers). Authorized once; completed as `mur7rhcu-p-imdr`.

### T4 PATH-corrected lab result
- `mur7rhcu-p-imdr` (Linux only): `--version` 11.1.1; `root -g` = `$PNPM_HOME/global/v11`, `bin -g` = `$PNPM_HOME/bin`; offline pack, global add, list and direct bin execution passed; Pi's exact prefix argv accepted and uninstall worked.
- Default policy silently skips postinstall on `add -g` (no warning). Documented `--allow-build=<name>` runs it only for that package.
- `pnpm setup` from the extracted entry wrote only the lab `.bashrc`; a fresh interactive bash still could not resolve `pnpm` (D2 FAIL).
- Gentle AI `installcmd/resolver.go:106-108`: Pi install ALWAYS runs `engramInitCommand()` (`pnpm dlx` or `npm exec`), executed by `agentInstallStep` (:58); `pipeline/stages.go:25-26` StopOnError is the default. Selection between `pnpm dlx` and `npm exec` remains unknown.
- Disclosed boundary issue: C1 printed a pnpm update notice despite a loopback registry, so pnpm likely contacted a public registry outside the counted budget (destination/bytes unverified). Counted: 4 requests/4,243,367 bytes. Lab cleaned; repository stable.

### T4 settled runner design
Rationale: tests use fake process/filesystem adapters, so lab network isolation is not a blocker for implementation; real-machine behavior remains a T7 gate.
- Pure module `scripts/installer-runner.mjs` with injected adapters (process runner with argv arrays, shell:false, deadlines; filesystem; clock/log). It accepts only a fixed plan derived from preflight plus explicit consent; never browser-supplied commands, URLs, paths or environment.
- pnpm invocation normalized to an argv prefix `[nodePath, pnpmEntry]` (from the bootstrap handoff) or a resolved `pnpm` executable.
- PNPM_HOME: use the user's existing value; otherwise pnpm's documented platform default. Child env always gets `PNPM_HOME` and PATH with `$PNPM_HOME/bin` first. Verify `bin -g` equals `$PNPM_HOME/bin`; mismatch blocks.
- Genuine npm gate: Gentle AI's Engram step may run `npm exec` and stops the pipeline on failure, so npm must resolve in the child env (bundled with the pinned official Node) or the runner blocks with an explicit reason. No npm wrapper or impersonation.
- Windows Go gate: if gentle-pi's postinstall would need Go (Windows) and preflight reports Go missing or too old, block; T4 does not acquire Go.
- Single fixed global install: `add -g @earendil-works/pi-coding-agent@1.0.0 gentle-pi@<own package version> --allow-build=gentle-pi` in ONE command (Pi is an optional peer dependency resolved next to gentle-pi). Never blanket build approval.
- After install: verify via `list -g --depth 0 --json` that both packages are present at the expected versions, the `gentle-shell` bin exists in `$PNPM_HOME/bin`, and package-native Gentle AI provisioning verifies through the existing integrity resolver with development overrides cleared.
- Run installed `gentle-shell setup` (public CLI) with the child env; nonzero, signal or deadline fails. Do not write the automatic provisioning marker or duplicate setup logic.
- PATH persistence: if `$PNPM_HOME/bin` was not already on the user's PATH, run consented `pnpm setup` and report `terminal-action-required` (open a new terminal); never claim fresh-terminal readiness from a child env.
- Outcomes: `blocked`, `failed`, `terminal-action-required`, `ready`. Any skipped, unverified or failed mandatory step can never yield `ready`. Existing installs/homes are never deleted; failures report the completed steps.
- Fix preflight: `globalBin.onPath` must test `$PNPM_HOME/bin` (pnpm 11), not `$PNPM_HOME`.
- Surfaces: `scripts/installer-runner.mjs`, `tests/installer-runner.test.ts`, `scripts/installer-preflight.mjs`, `tests/installer-preflight.test.ts`, `docs/install-wizard.md`. Forecast 500–750 lines. Risk: high.

### T4 implementation evidence (uncommitted)
- Writer `mur7zk8j-q-iklz`: `scripts/installer-runner.mjs` (new, 261), `tests/installer-runner.test.ts` (new, 316, 18 tests), `scripts/installer-preflight.mjs` (+33/-1, `pnpmGlobalBin`), `tests/installer-preflight.test.ts` (+16/-1), `docs/install-wizard.md` (+136/-13). About 777 lines; over the advisory forecast because of contract documentation.
- RED: runner `ERR_MODULE_NOT_FOUND`; preflight missing `pnpmGlobalBin` export. GREEN: preflight 22/22, runner 18/18. Mutation check: adding `--dangerously-allow-all-builds` failed the exact add -g test, then reverted.
- Writer verification: combined suites 130 tests, 117 pass, 0 fail, 13 native Windows skips, 26.2s; `git diff --check` clean.
- Decision: only the clean-stack plan is supported; existing or partial Pi/gentle-pi installs return `blocked` (`unsupported-plan`) so the pinned single `add -g` never downgrades or duplicates them. Upgrades stay with `gentle-shell update`. A verify-only path is a possible later extension.
- Writer-noted risks for review/T7: `list -g --json` `path` shape unverified on real machines (missing → failed); setup runs `node <pkgRoot>/bin/gentle-shell.mjs setup` because `.cmd` shims cannot run with `shell:false`; one consent covers the plan, so T5/T6 must show the `pnpm setup` profile change before consent; chosen deadlines 30s probes/`pnpm setup`, 20 min install/setup; genuine npm proof is structural, not cryptographic.
- Risk tier: high (installer). Next: independent verifier, parent spot check, native review, work-unit commit.

### T4 independent verification and scoped correction
- Verifier `mur89jrr-r-be4r`: PASS, 130 tests/117 pass/0 fail/13 native skips, diff checks clean, no severe defects.
- Accepted for the single scoped correction: F1 Windows npm resolution must follow PATHEXT order per directory like Go `exec.LookPath` (`installer-runner.mjs:123-127`); A1 the runner itself confirms via `list -g --depth 0 --json` that Pi and gentle-pi are absent before `add -g`, otherwise `blocked`; A6 tighten the Go test to the exact reason and add win32 Path/case and positive `packageNativeGentleAi` tests.
- Recorded as later gates, not corrected now: A2 no post-setup re-probe for `verify-readiness`; A3 `onPath` depends on the caller env and fresh-terminal Node resolution is unverified (T5 must pass the real user env); A4 `projects.length === 1` may fail closed with other global packages (T7); A5 installed package identity, shim target and POSIX exec bit not verified (T7).
- Correction `mur8epna-s-joyp`: F1 Windows npm resolution now follows PATH order then PATHEXT order like Go `exec.LookPath` (`npm-shadowed` blocks); A1 new pre-install `check-existing-stack` runs `list -g --depth 0 --json` and blocks with `existing-stack` or `global-list-unavailable`; A6 exact Go reasons, win32 `Path`/`bin -g` case tests and a positive `packageNativeGentleAi` test. Runner 312 lines, tests 440 lines (22 tests). RED: 12/22 failed for the expected reasons; GREEN 22/22; PATHEXT mutation check failed exactly one test, then reverted. A6 Go and win32 Path tests are characterization tests (no own RED).
- Writer and parent spot check: 134 tests/121 pass/0 fail/13 native skips (26.1s); `git diff --check` clean. The writer's stray `/tmp/runner-tail-3619111.ts` (a copy of the test tail outside allowed surfaces) was inspected and removed by the parent.
- New T7 checks: clean-machine `pnpm list -g --json` output shape (empty output blocks closed); Windows current-directory lookup (`ErrDot`/`NoDefaultCurrentDirectoryInExePath`) not reproduced. A fake `npm.cmd` earlier in PATH reports `npm-unavailable` rather than `npm-shadowed` (still blocks).

### T4 closure evidence
- Native review `review-7d456e98582a8344`: controller-selected medium, one consolidated `review-reliability` run; approved on the last admitted event. Exact acknowledgement burned authority for target `sha256:bb9e531446008047217a1c8d2f72c2f07ba12860c8222835eb17951da3b98729`, consumed revision `sha256:0cbab3ad68771f222d4daf6eb088d133b2c2908c08187e32a9509587fcbcbb00`. The installer-high functional checks above still apply; native medium classification does not replace them.
- Source commit `0d9dac2cc90db922283f40cffa03958ba827fd42` (`feat(installer): add standard installation runner`): staged and committed trees equal frozen `2aba557ebaa015241c998fe6f707f0e8715e30a3`; 6 files, 1,074 insertions/21 deletions.
- Nonblocking advisories (receipt stands; separate later work, no automatic correction): `R3-multi-project-list` (`scripts/installer-runner.mjs:199`), `R3-no-rerun-recovery` (`:269-273`), `R3-npm-node-resolution` (`:162`), `R3-pnpm-path-fallback-untested` (`:114-117`), `R3-stale-ledger-status` (ledger, addressed by this closure), `R3-unmodified-plan-overclaim` (`docs/install-wizard.md:127-128`), `R3-verify-readiness-no-step` (`:39`).
- Carried into T5: build the plan server-side only and never round-trip it through the browser; pass the real user environment; show the `pnpm setup` profile change and all fixed actions before one consent; map `blocked` reasons (`existing-stack`, `npm-unavailable`, `npm-shadowed`, `go-required`, `unsupported-plan`, `global-list-unavailable`) to clear guidance.
- Carried into T7: `list -g --json` shape on clean and populated machines, rerun/recovery after partial failure, Windows current-directory lookup, installed package identity/shim target/exec bit, fresh-terminal Node and `gentle-shell` resolution, the observed uncounted pnpm update-notifier network contact.
- Next: T5 secure local wizard host and packaged entry.
