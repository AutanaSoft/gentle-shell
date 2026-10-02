# Browser installation wizard

## Objective
Install all prerequisites and the normal Gentle Shell stack through a local-browser wizard on Windows, macOS and Linux. The final behavior must match global `gentle-pi` installation and running `gentle-shell` in a terminal.

## Problem and rationale
Current setup requires a usable Node/Pi runtime and Windows native provisioning requires Go. A browser wizard should acquire missing prerequisites, explain installation progress and verify readiness without duplicating the existing provider/companion installation logic.

## Authorized scope and constraints
- User authorized implementation after approving the corrected design.
- User later granted standing permission for in-scope labs, research, implementation, verification and work-unit commits without per-step prompts ("te permito todo, tiene que quedar genial"). Destructive actions and outward publishing (push, PR, release) still require explicit confirmation.
- Visual reference for the wizard UI: https://gentlemanprogramming.com (verify in a browser during T6).
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
- Running committed authored lines through T4 closure (ledger `f7553801` adds about 30): 3,926 (T1 417 + T2 1,041 + T2 ledger 21 + T3 source 1,337 + T3 ledger 15 + T4 source 1,095). This T4 closure ledger is a separate passive commit.
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
- [ ] T5 — Secure local wizard host and packaged entry. Status: split into T5a (probes and runtime persistence, closed in `e4cac184`) and T5b (secure host and entry, pending); see "T5 settled design". Route: delegated direct. Surfaces: `bin/gentle-shell-install.mjs`, `scripts/installer-server.mjs`, `tests/installer-server.test.ts`, `package.json`, `scripts/verify-package-files.mjs`, `tests/verify-package-files.test.ts`, `docs/install-wizard.md`. Forecast: 350–500 lines. Checks: focused server/package tests; loopback binding, Host/Origin/session authorization, explicit install consent, bounded logs and no arbitrary command/path API.
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
T1–T4 are closed with commits, independent verification and native review. T5 is split: T5a (real probes and runtime persistence) is implemented and independently verified, closed in commit `e4cac184` after one scoped correction and native review; T5b (secure local host and entry) follows. T6 uses gentlemanprogramming.com as the visual reference. Native Windows/macOS and clean-machine acceptance remain T7. Development stays in the isolated worktree; product/runtime/Engram roots are unchanged.

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

### T4 evidence summary (closed)
Full lab and research details are preserved in Engram topics `installer/t4-public-contract-findings`, `installer/t4-corrected-lab-result`, `installer/t4-observed-lab-result`, `installer/t4-observed-lab-path-fix-result`, `installer/t4-runner-design`, `installer/t4-independent-verification`, `installer/t4-scoped-correction` and `installer/t4-closure`.
- Mapping (`mur18ury-j-eq2v`): existing setup owns companions; native-path existence is not provenance; a development override is not package-native proof; manual setup writes no auto-provisioning marker; launcher exit is not readiness; Windows installer resolves Go before bundle reuse; child PATH is not fresh-terminal readiness.
- Public research (`mur2mlxy-l-00gv`, 20 GETs): Pi 1.0.0/0.99.1 array `npmCommand` and pnpm `--prefix` argv; Gentle AI always runs an Engram init (`pnpm dlx` or `npm exec`) executed by `agentInstallStep`, StopOnError by default.
- Two labs failed on harness static-prediction errors (assumed dist path; quoted strings treated as imports), one on a harness PATH error; none was a pnpm defect. The observation-based redesign then proved (Linux): global bin is `$PNPM_HOME/bin` and must be on PATH; `add -g` silently skips postinstall unless `--allow-build=<name>`; Pi's prefix argv is accepted. One run likely contacted the registry through pnpm's update notifier outside the counted budget (disclosed).
- Runner design and implementation: single fixed `add -g @earendil-works/pi-coding-agent@1.0.0 gentle-pi@<version> --allow-build=gentle-pi`; genuine-npm gate with Windows PATHEXT-order resolution; Windows Go gate; pre-install `list -g` existing-stack block; package-native integrity without overrides; public `gentle-shell setup`; `pnpm setup` → `terminal-action-required`; never `ready` on skipped/unverified steps. Existing stacks are blocked; upgrades stay with `gentle-shell update`.
- Verification: writer RED/GREEN, independent verifier PASS (`mur89jrr-r-be4r`), one scoped correction (`mur8epna-s-joyp`), parent 134 tests/121 pass/13 native skips. Native review `review-7d456e98582a8344` approved and acknowledged. Commit `0d9dac2cc90db922283f40cffa03958ba827fd42` (tree `2aba557e`), ledger `f7553801`.
- Nonblocking advisories for later: `R3-multi-project-list`, `R3-no-rerun-recovery`, `R3-npm-node-resolution`, `R3-pnpm-path-fallback-untested`, `R3-unmodified-plan-overclaim`, `R3-verify-readiness-no-step`.
- T7 checks carried: `list -g --json` shapes, rerun/recovery, Windows current-directory lookup, installed identity/shim/exec bit, fresh-terminal resolution, update-notifier network contact.

### T5 mapping and decisions
- Explorer `mur8s5uo-t-8sgi` (read-only, CodeGraph first). Key facts: `launchWizard` spawns `bin/gentle-shell-install.mjs` with no argv and inherited stdio/cwd; nonzero exit makes the bootstrap delete its owned tools, exit 0 keeps them. POSIX passes pnpm only through PATH; Windows also sets `GENTLE_INSTALL_PNPM_*`. Preflight has no real host probes yet, so T5 must supply all eight. `processCheck` is synchronous and unsuitable for the long-running server. Packaging already ships `bin/`, `scripts/`, `assets/`; `verify-package-files` must list installer files and export a testable helper. No existing HTTP server or browser opener.
- Parent decisions: D1 real probes in a separate `scripts/installer-probes.mjs` with tests; `globalBin.writable` = write access on the nearest existing ancestor of `$PNPM_HOME/bin`, without writing. D3 exit 0 for `ready`/`terminal-action-required`, nonzero for `blocked`/`failed`/closed without install. D4 print the URL and open it with a fixed per-platform opener; the one-time code expires quickly and is single-use. D5 minimal placeholder page until T6; tests use fixture assets. D6 the runner strips `GENTLE_BOOTSTRAP_*` and `GENTLE_INSTALL_*` from the env passed to `gentle-shell setup` (small runner edit).
- Open product decision D2: a bootstrap-acquired Node lives in a temporary tools directory that is not on the user's real PATH, so after the wizard an ordinary terminal may not find `node` (or the npm that Gentle AI's Engram step needs). Asked the user where Node should persist.
- D2 resolved: user selected `persist_node_via_pnpm`. Verification lab `mur8yve2-u-7kqn` (authorized once) checks pnpm 11.1.1 Node management, integrity and fresh-shell resolution before implementation.
- Node lab `mur8yve2-u-7kqn`: `pnpm env use --global 24.21.0` persists Node under `$PNPM_HOME` and links only `node` into `$PNPM_HOME/bin`; a fresh bash after `pnpm setup` resolves it. npm and pnpm are NOT placed in `$PNPM_HOME/bin`. `env use` is deprecated in favor of `pnpm runtime set node <version> -g`. The global lockfile sha256 for the Node tarball equals the official pin; download-time verification was not observed. The update notifier contacted registry.npmjs.org. The child's cleanup was blocked by the safety hook; the parent inspected and removed the lab.
- Visual reference `mur8zlmy-v-6de5`: CSS-source extraction (no screenshots; ego-browser CLI unavailable on Linux). Tokens saved in Engram topic `installer/t6-visual-reference`. Dark-only palette with accent `#f095c8` on `#1a1218`; no web fonts (local font stacks only); do not copy logos, branding images, favicon or photos.
- Next: follow-up Node lab for `runtime set node 24.21.0 -g` plus pinned `add -g npm@11.19.0 pnpm@11.1.1` (npm 11.19.0 is the version bundled with Node 24.21.0), then the T5 writer.
- Follow-up lab `murdct4a-w-q23y`: `runtime set node 24.21.0 -g` (no deprecation), then `add -g npm@11.19.0 pnpm@11.1.1`, then `setup` leave `node`, `npm`, `npx` and `pnpm` in `$PNPM_HOME/bin`; a fresh bash resolves all three there (v24.21.0, 11.19.0, 11.1.1), shadowing host npm. Shims run `$basedir/node`. Gotcha: npm's default `prefix` then points inside pnpm's content-addressed store. Parent removed the lab (181 MB) after the safety hook blocked the child.

### T5 settled design
Split into two work units, each with its own verification, review and commit.

**T5a — real probes and runtime persistence (runner extension).**
- `scripts/installer-probes.mjs`: async real probes for `node`, `pnpm`, `pi`, `shell`, `gentleAi`, `go`, `globalBin`, `setup` with injected spawn/fs; bounded deadlines and output; never write. `globalBin.writable` checks the nearest existing ancestor of `$PNPM_HOME/bin`. Node/pnpm report their source: persistent (resolvable from the user's real PATH) or bootstrap-only (inside the bootstrap tools directory).
- Runner: when Node is bootstrap-only or a genuine npm is not resolvable, add fixed steps before the stack install: `runtime set node 24.21.0 -g`, then `add -g npm@11.19.0 pnpm@11.1.1`. The genuine-npm gate also accepts the pnpm-global npm shim in `$PNPM_HOME/bin` whose target is `node_modules/npm/bin/npm-cli.js` inside `$PNPM_HOME` with package `npm@11.19.0`.
- npm prefix: only when npm's effective prefix resolves inside the pnpm store and the user has no explicit prefix, set the user-level npm prefix to `$PNPM_HOME` (listed as a fixed action requiring consent). Never overwrite an existing prefix.
- D6: strip `GENTLE_BOOTSTRAP_*` and `GENTLE_INSTALL_*` from the env passed to `gentle-shell setup`.
- Surfaces: `scripts/installer-probes.mjs`, `tests/installer-probes.test.ts`, `scripts/installer-runner.mjs`, `tests/installer-runner.test.ts`, `scripts/installer-preflight.mjs`, `tests/installer-preflight.test.ts`, `docs/install-wizard.md`.

**T5b — secure local host and packaged entry.**
- `scripts/installer-server.mjs` per the mapped design: `127.0.0.1:0` only, exact Host, Origin plus `X-Gentle-Install` header on POST, one-time short-TTL session code → HttpOnly SameSite=Strict cookie, fixed endpoints (`/`, assets, `/api/plan`, `/api/install`, `/api/progress`, `/api/shutdown`), server-side plan with `planId` and re-inventory 409, single-flight, bounded ring-buffer log, strict headers/CSP, guidance for every blocked reason and failed step, idle timeout.
- `bin/gentle-shell-install.mjs`: wires real probes/adapters (async spawn, fs), prints the URL and opens it with a fixed per-platform opener; exit 0 for `ready`/`terminal-action-required`, nonzero otherwise.
- Minimal `assets/install-wizard/index.html` placeholder until T6.
- `verify-package-files`: list installer files and export a testable helper.
- Surfaces: `bin/gentle-shell-install.mjs`, `scripts/installer-server.mjs`, `tests/installer-server.test.ts`, `assets/install-wizard/index.html`, `scripts/verify-package-files.mjs`, `tests/verify-package-files.test.ts`, `docs/install-wizard.md`.

### T5a implementation evidence (uncommitted)
- Writer `murdr48a-x-kllq`: `scripts/installer-probes.mjs` (new, 293), `tests/installer-probes.test.ts` (new, 311, 17 tests), `scripts/installer-runner.mjs` (+164/-34), `tests/installer-runner.test.ts` (+253/-9), `scripts/installer-preflight.mjs` (+21/-2), `tests/installer-preflight.test.ts` (+19), `docs/install-wizard.md` (+145/-24). About 1,275 lines; over the advisory heuristic because of test tables and documented contract.
- RED observed: probes `ERR_MODULE_NOT_FOUND`; runner missing `persistencePins` export then 9 assertion failures; preflight persistence-intent test. GREEN: probes 17/17, runner+preflight 55/55 (one test-only assertion fix). Mutation checks: all targeted rules killed after isolating two initially surviving mutants.
- Writer verification: 162 tests/149 pass/0 fail/13 native skips (26.2s); diff checks clean. Temporary `/dev/shm/t5a-mut-hashes.txt` removed by the writer.
- Open gaps for the parent: (1) pnpm bootstrap-only with persistent Node and genuine npm does not persist pnpm; (2) when npm is missing but Node is persistent, `runtime set` puts pnpm's Node first in `$PNPM_HOME/bin` and may shadow the user's Node — must be shown before consent; (3) an explicit user prefix pointing inside the store is indistinguishable from the default without reading `.npmrc`; (4) Windows npm global bins land in the prefix root, possibly off PATH (T7); (5) Windows shim text and `runtime set` layout are assumed (T7); (6) Pi bin name `pi` unverified locally; (7) pnpm major must be 11 (pnpm 12 on PATH blocks on POSIX); (8) deadlines kill only the direct child; `access(W_OK)` ignores Windows ACLs.
- Risk: high. Next: independent verifier, then at most one scoped correction including gaps (1) and (2).

### T5a independent verification and scoped correction
- Verifier `mureiums-y-e31e`: PASS, 162 tests/149 pass/0 fail/13 native skips; diff checks clean; no severe defects; T4 guarantees intact.
- Accepted for the single scoped correction: persist only what is missing — Node bootstrap-only keeps the full group; with a persistent user Node, no `runtime set`, and one `add -g` containing only `npm@11.19.0` (no genuine npm) and/or `pnpm@11.1.1` (pnpm bootstrap-only). This removes user-Node shadowing and uses the ignored `pnpm.persistent` evidence. Also: probe deadline settles without waiting for `close`; npm prefix resolves the store with `pnpm store path` and fails closed; POSIX symlinked npm must pass realpath confinement and the pin.
- Recorded, not corrected: `npm config set --location=user` may rewrite `~/.npmrc` formatting; npm global bins share `$PNPM_HOME/bin` on POSIX; underlying tools may write logs/update-notifier state during probes (T7).
- Correction `murerdbi-z-5qwl` applied: persistent user Node → no `runtime set`, one fixed `add -g` with `npm@11.19.0` and/or `pnpm@11.1.1` (4 exact accepted variants) plus pnpm verification; probe deadline settles without `close`; npm prefix uses `pnpm store path` and fails closed; every npm in `$PNPM_HOME/bin` (symlink or shim) is confined and pinned. RED observed per change; 8 mutations killed. Writer and parent spot check: 169 tests/156 pass/0 fail/13 native skips (26.2s); diff check clean; no stray files.
- New T7 checks: pnpm-managed persistent Node missing npm skips the prefix check; pnpm shim target assumed from pin metadata; `pnpm store path` containment; full-group added pnpm still unverified.

### T5a closure evidence
- Native review `review-5ad487c03b1146fc`: controller-selected medium, one consolidated `review-reliability` run; approved and exactly acknowledged (authority burned) for target `sha256:08ca8533db2b06f5d47ae44bf87001335fd86bef0a68915da291e9fa1a98f428`, consumed revision `sha256:0b97bdd062e7fe8dae5dc2d3fb6da70aca3377b80b225964f5a299c531b9f7b6`.
- Commit `e4cac184c7d707d44ef036f517cc2d85a9eb4c8d` (`feat(installer): add host probes and pnpm runtime persistence`): staged and committed trees equal frozen `d4a70b589b337b2470fa3e3eb09be82eb04b9b63`; 8 files, 1,575 insertions/201 deletions (diff counted against the compacted ledger).
- Nonblocking advisories for later: `R3-full-group-pnpm-unverified` (`scripts/installer-runner.mjs:470-473`), `R3-incompatible-user-pnpm-persistent` (`scripts/installer-probes.mjs:245`), `R3-npm-pin-downgrade` (`scripts/installer-runner.mjs:249-252`), `R3-old-persistent-node-blocks` (`scripts/installer-probes.mjs:222-223`), `R3-readtext-bound-toctou` (`scripts/installer-probes.mjs:155-158`).
- Next: T5b secure local host and packaged entry.

### T5b implementation evidence (uncommitted)
- Writer `murf6rft-10-azav`: `scripts/installer-server.mjs` (new, 461), `bin/gentle-shell-install.mjs` (new, 114), `tests/installer-server.test.ts` (new, 567, 18 tests), `assets/install-wizard/index.html` (new, 25, static placeholder), `scripts/verify-package-files.mjs` and its test (exports `installerPaths`, `requiredPaths`, `missingRequiredPaths`), `docs/install-wizard.md` (+186/-13 across modified files).
- RED: `ERR_MODULE_NOT_FOUND` and missing `installerPaths` export; then 3 real assertion failures (missing Host 400 vs 421, plan body 413 vs 400, guidance regex). GREEN 29/29 focused. 14 server mutations killed; one equivalent survivor (early Content-Length check). Real-entry smoke: session 303, index 200, bad Host 421, SIGINT exit 1 (no probes, no network).
- Writer verification: 198 tests/185 pass/0 fail/13 native skips; `node scripts/verify-package-files.mjs` passed (166 files); diff check clean; temporary `/dev/shm` files removed.
- Writer-noted risks: bootstrap pnpm directory appended at the END of the runner PATH on POSIX (children may see the temporary pnpm when it is not persisted); placeholder has no JS, so the wizard currently always exits 1 and the bootstrap removes its tools (expected until T6); CSP blocks inline style so the placeholder uses legacy color attributes; the one-time URL is visible in the opener argv until used (single-use, 2 min TTL); SIGTERM during install does not cancel runner children; guidance coverage test parses runner source with regex because reasons/steps are not exported.
- Risk: high (local mutation API).
- Independent verifier `murflaxp-11-2zi2`: PASS (198 tests/185 pass/0 fail/13 native skips; package check passed); offensive loopback probing found no command/URL/path/env/plan influence and no single-flight bypass. The user asked to finish and correct, so one scoped hardening correction is accepted: private 0600 redirect file instead of the one-time code in opener argv; idle timestamp only after Host/session validation; `X-Gentle-Install` required on every `/api/*` request; reject install after completion with 409; export runner blocked reasons and failed steps and test guidance coverage against them; add `Cross-Origin-Resource-Policy` and `Cross-Origin-Opener-Policy` headers. Not a defect: bootstrap pnpm appended at the end of PATH. T7: Ctrl+C reaching the helper process group and SIGTERM leaving runner children.
- Hardening correction: first writer `murfrx6l-12-blwa` was lost in a session restart after partial edits (server CORP/COOP and `already-completed`, runner exports); writer `murg28n0-1-7ybw` finishes the remaining items from the partial tree.
- Writer `murg28n0-1-7ybw` finished the hardening: item 1 (private 0600 redirect file instead of the code in opener argv) implemented with RED→GREEN; items 2–6 were already applied by the lost writer (no RED available, covered by existing tests). 208 tests/195 pass/0 fail/13 native skips; package check passed. Raised risk: the `file:` redirect makes `/session`→303→`/` cross-site so the Strict cookie may not reach `/`; parent decided `/session` returns 200 with a same-origin meta refresh (same correction round, `murg8ko0-2-a7or`).
- `murg8ko0-2-a7or`: `/session` now returns 200 with a same-origin meta refresh and the Strict cookie (RED: 19 tests expected 200, got 303; GREEN 26/26). Parent spot check: 208 tests/195 pass/0 fail/13 native skips; package check passed; diff and whitespace checks clean; no stray temp files. Test note: some server tests call `login()` outside try/finally, so failures can hang the run without `--test-timeout` (advisory). Next: native review and commit.
