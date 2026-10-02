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
- Base/initial review boundary: `7a27c1c008b3922b851da5efb78e4ca4dae6e6b1`.
- Original forecast: 2,350–3,610 authored changed lines; revised forecast approximately 3,040–4,100 after the cohesive T2 security/tests unit exceeded its initial estimate. Counts are additions plus deletions, generated files excluded; correction size still pending.
- Running committed authored lines: 417 (T1 includes its feature task document).
- Last reviewed boundary: `09860c05ee951cdfa85abfb4006c56ca577b28d3`.
- Delivery strategy: `single-pr`, explicitly selected by the user. No chain strategy or tracker applies. Any repository size-exception approval remains a separate future publishing gate.
- No publishing is implied by a delivery-strategy choice.
- Each task uses delegated direct: unfamiliar preparation and two or more non-trivial implementation files trigger a bounded writer.
- Task size around 400 lines is advisory, not a cap. Never compress code or omit checks to meet it.
- Tests first where deterministic expected behavior exists: observed RED, GREEN, then checked refactoring. Report unavailable or non-applicable checks honestly.
- RDD currently on globally; review candidates are work-unit commits or review slices, never checkboxes. Native review does not replace functional verification.

## Tasks
- [x] T1 — Dependency inventory and ordered preflight plan. Status: done; commit `09860c05ee951cdfa85abfb4006c56ca577b28d3`, three independent focused runs passed 21/21, native medium review approved and acknowledged. Route: delegated direct (preparation and multiple non-trivial files). Surfaces: `scripts/installer-preflight.mjs`, `tests/installer-preflight.test.ts`, `docs/install-wizard.md`. Forecast: 250–360 lines. Checks: `node --experimental-strip-types --test tests/installer-preflight.test.ts`; fake inventory/process adapters, no host provisioning.
- [ ] T2 — POSIX clean-machine bootstrap. Status: in progress; user-authorized deadline correction returned 55/55 POSIX and 76/76 combined tests. Final independent verification is pending; native review/commit remain pending. Route: delegated direct. Surfaces: `scripts/bootstrap.sh`, `scripts/installer-downloads.mjs`, `tests/installer-posix-bootstrap.test.ts`, `docs/install-wizard.md`. Initial forecast: 350–550 lines; returned 860 lines before bounded correction, retaining integrity/security tests and docs. Checks: focused POSIX bootstrap tests and native macOS/Linux lanes; verify integrity, spaces and environment refresh.
- [ ] T3 — Windows clean-machine bootstrap. Route: delegated direct. Surfaces: `scripts/bootstrap.ps1`, `scripts/installer-downloads.mjs`, `tests/installer-windows-bootstrap.test.ts`, `docs/install-wizard.md`. Forecast: 350–550 lines. Checks: focused Windows bootstrap tests and native Windows lane; compatible Go acquisition, quoted paths and inherited environment.
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
Exploration completed by `gentle-ai-explore` (task `muqpt2zf-3-54b7`). User selected one future PR. T1 writer `muqq4ay0-4-dazo` returned the three authorized files (342 additions) with 21/21 focused tests passing. Parent read back the full bounded changes. ASSESS was unassessable because untracked scope was undeclared and required an independent verifier. INSPECT explicitly selected the four intended untracked files and returned ready without creating a lineage. Independent verifier `muqqewpj-5-xgbi` completed: 21/21 tests and whitespace checks passed, no severe deterministic findings. Parent reran the same focused command as its bounded spot check. T1 is closed in commit `09860c05ee951cdfa85abfb4006c56ca577b28d3`. Its native medium reliability review `review-eda68029d737a4f8` approved and acknowledgement burned authority. T2 writer `muqsi390-6-1ko6` returned 860 authored lines: 50 POSIX tests/71 combined tests, shell syntax and whitespace passed. Parent read back the shell/helper and found a real upstream metadata spelling mismatch (`>=22.13` versus `>=22.13.0`) that would reject legitimate pnpm. Bounded correction `muqt9gtx-7-ddg0` completed: regression RED 49/52 (three intended failures), GREEN 52/52 and combined 73/73. Literal upstream metadata now differs safely from normalized comparison; integrity/identity unchanged. Parent staged the five intended files and native ASSESS measured 902 lines/high risk (shell/process boundary), requiring independent verification. Verifier `muqte4m0-8-szun` passed 73 tests/syntax/whitespace, but its exactly authorized disposable probe reported `bounded(1) still running after 2500ms: true`, then outer SIGKILL ended the fresh detached child group. Shell sends TERM once and waits without escalation; helper spawnSync has an analogous static-only concern, not dynamically reproduced. Ledger MM drift was attributed to parent-only status edits; source/docs/tests remained stable. T2 remains open. User explicitly selected `fix_timeouts` over pause. Deadline writer `muqts0u4-9-0imq` returned the bounded correction (153 authored lines): RED 53/55 required external guards, GREEN shell failed at 10.03s/Node at 15.07s; 55/55 POSIX and 76/76 combined passed. Parent read back the changed watchdog/process/test paths and restaged the five intended files; ASSESS remains high (1041 lines), requiring final independent verification. Guarantees cover owned direct, non-forking probes only; descendant stdio/process-tree cancellation is not established. No automatic further correction loop is allowed. Native review/work-unit commit remain pending. Bootstrap targets an extracted/checkout bundle; no published bundle URL is invented.

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
