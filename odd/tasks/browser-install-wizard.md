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
- Running committed authored lines through T3 source: 2,816 (T1 417 + T2 1,041 + T2 closure ledger 21 + T3 1,337); this T3 tracking closure is a separate passive ledger commit.
- Last reviewed source boundary: `ffdc7f74e3cbd172a7c2233e40c6807a9bdd4b7a`; committed tree exactly matched approved frozen T3 tree `4e227bc619d1c8825b78d65613f9adf9768f2312`.
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
- [ ] T4 — Standard installation driver. Route: delegated direct. Surfaces: `scripts/installer-runner.mjs`, `tests/installer-runner.test.ts`, `docs/install-wizard.md`. Forecast: 350–550 lines. Checks: focused runner tests; Pi/global package installation via pnpm, normal setup, partial failure and no alternate product roots.
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
T1 and T2 bounded source units are closed with evidence below. T3's initial writer and independent verifier passed 94 portable tests with four skips, but verification found three empty always-skipped native placeholders and ancestor-ACL over-rejection. One bounded correction worker (`muqwpdkq-e-gfyf`) timed out after editing. Read-only incident inspection found depth-sensitive masks and substantial real native callbacks; no post-correction test result or RED/GREEN history is available.

The shared worktree had switched to `fix/bridge-only-agent-wake` with unrelated commit/work. The user authorized isolating the installer, transferring exactly seven installer files and cleaning only their pending originals after copy verification. All seven byte hashes/modes were verified. The main branch/commit and its unrelated pending ledger were preserved; the installer now uses its own worktree on `feat/browser-install-wizard` at `07e4971d`. Product/runtime/Engram roots are unchanged.

Fresh independent verification (`muqyo9ni-g-ocro`) passed 111 total/98 passed/13 skipped in 26.014s; final read-only writer self-verification (`muqz9ufr-h-dlq0`) matched those counts in 26.140s. Both passed syntax/whitespace and source stability checks. Human-authorized archive proof (`muqziidu-i-sv6f`) made one public GET, verified the pinned SHA512 before the existing parser accepted 448 entries from 4,223,291 bytes; actual package identity, version, raw engine and bin matched. No artifact execution/extraction/installation occurred and owned temporary storage was cleaned. Next: bounded parent spot check and exact native review of the stable T3 source unit. Native Windows remains unavailable. Go preparation and persistent terminal readiness remain T4; the missing T5 wizard entry intentionally prevents real acquisition. No T3 native START/lineage or commit exists. Final normalized work-unit review must target this isolated worktree, never the accumulated feature branch.

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
