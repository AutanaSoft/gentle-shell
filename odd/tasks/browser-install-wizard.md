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
- [x] T5 — Secure local wizard host and packaged entry. Status: closed in two work units: T5a `e4cac184` (probes and runtime persistence) and T5b `00360106` (secure host, entry, placeholder, package verification); both independently verified and natively reviewed. Real-browser and native-platform behavior remain T7. Route: delegated direct. Surfaces: `bin/gentle-shell-install.mjs`, `scripts/installer-server.mjs`, `tests/installer-server.test.ts`, `package.json`, `scripts/verify-package-files.mjs`, `tests/verify-package-files.test.ts`, `docs/install-wizard.md`. Forecast: 350–500 lines. Checks: focused server/package tests; loopback binding, Host/Origin/session authorization, explicit install consent, bounded logs and no arbitrary command/path API.
- [x] T6 — Accessible browser wizard and terminal handoff. Status: closed in `76b4d8a5`; writer, independent verifier, one scoped polish correction, parent visual review and native review. Real browsers, screen readers and native platforms remain T7. Surfaces: `assets/install-wizard/index.html`, `assets/install-wizard/wizard.js`, `assets/install-wizard/wizard.css`, `tests/install-wizard.test.ts`, `scripts/install-wizard-preview.mjs` (dev preview with fake scenarios on the real server), `scripts/installer-server.mjs`, `tests/installer-server.test.ts`, `scripts/verify-package-files.mjs`, `tests/verify-package-files.test.ts`, `README.md`, `docs/install-wizard.md`. Visual reference: gentlemanprogramming.com tokens; visual checks use the local Playwright Chromium headless build with screenshots at 1440px and 390px. Forecast: 450–700 lines. Checks: focused UI tests plus Ego Browser with a fake driver; keyboard, consent, progress, failure/retry and handoff.
- [ ] T7 — Cross-platform acceptance and parity evidence. Status: Linux clean-machine acceptance PASSED and T7a committed in `ae011a12` (independent verifier + high four-lens native review approved). Native Windows/macOS evidence comes from the new CI `installer` matrix after the user-authorized push; real browsers, screen readers, zsh/fish and other distros remain open. Route: delegated direct. Surfaces: `.github/workflows/ci.yml`, `scripts/test-installer-runner.mjs`, `tests/installer-acceptance.test.ts`, `docs/install-wizard.md`. Forecast: 250–400 lines. Checks: deterministic matrix, explicit clean-machine native checks, preserved existing installs and parity with standard terminal launch.

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
T1–T6 and T7a are closed; PR #1703 is open (Closes #1700). T7b committed in `81b420c7` (native review `review-81da8731c385acb8` approved; advisories: native guard `exit 0` unproved, install chain lacks terminal catch). User chose to push T7b and T7c together. T7c implemented by `mus7ethc-g-b41x` (partial-install recovery; parent check 258 tests/244 pass/0 fail/14 native skips, typecheck no regressions); native review and commit next, then one push of T7b+T7c. Merge and release remain the user's decisions.

## Work-unit evidence (condensed)
Full per-unit evidence lives in Engram topics `installer/*` (t4-*, t5a-*, t5b-*, t6-*, t7-*, t7a-*, t7b-*) and in git history.

| Unit | Commit | Verification | Native review |
|---|---|---|---|
| T1 preflight | `09860c05` | 21/21 writer, independent, parent | `review-eda68029d737a4f8` approved |
| T2 POSIX bootstrap | `03e770f7` | 76/76 writer, independent, parent | `review-5cbf4ce0e04bf1de` high, approved |
| T3 Windows bootstrap | `ffdc7f74` | 98 pass/13 native skips; real pnpm archive proof | `review-2aa665d2b4350300` approved |
| T4 runner | `0d9dac2c` | 121 pass; independent PASS + one correction | `review-7d456e98582a8344` approved |
| T5a probes + persistence | `e4cac184` | 156 pass; independent PASS + one correction; two labs proved pnpm-managed Node/npm/pnpm | `review-5ad487c03b1146fc` approved |
| T5b secure host + entry | `00360106` | 195 pass; offensive loopback verification PASS; hardening | `review-0f4c1883b3f3d950` approved |
| T6 wizard UI | `76b4d8a5` | 219 pass; CDP Chromium screenshots, 0 CSP violations | `review-d22416227f5c4e67` approved |
| T7a acceptance + CI | `ae011a12` | 232 pass; Linux clean-container acceptance PASS end to end | `review-2fead884599842f6` high, approved |

Key decisions: existing stacks are blocked (upgrades stay with `gentle-shell update`); persist only what is missing (never shadow a user's Node); `--allow-build=gentle-pi` only; stderr captured only for `shell-setup` and `persist-path` (bounded, sanitized); bootstrap removes only its owned tools after success.

Known upstream/environment facts: Gentle AI resolves the latest Engram through the anonymous GitHub API (60/h per IP); `pnpm setup` needs `SHELL`, prints errors on stdout and installs `@pnpm/exe` first; it writes only the interactive shell profile; Gentle AI creates an empty `~/.pi/gentle-ai`.

Open debt: close/signals do not wait for the runner; deadlines kill only the direct child; real browsers/screen readers, macOS and Windows native acceptance, zsh/fish; nonblocking review advisories recorded per unit in Engram.

### T7b PR feedback and CI fixes (committed `81b420c7`)
- Mapping `mus5u9pr-e-ly36` against CI run 37109363955 and reviews by egdev6 and CodeRabbit.
- Writer `mus61gr6-f-3emj`: macOS fixture canonicalization (RED reproduced with a symlinked TMPDIR), Windows probe chmod skip, native guard `exit 0` + stderr in the assertion, typecheck fixes (+2 hidden TS2345), empty Windows PATH entries skipped (P1), `pnpm setup` uses `deadlines.setup`, server resets `installing` in `.finally`, stale docs and recorded debt. 10 files, +108/-24.
- Parent spot check: 249 tests/235 pass/0 fail/14 native skips; `pnpm run typecheck` no regressions (187 recorded); diff check clean; temp files removed. Windows native items need CI after push.
- T7c next: partial-install recovery (exact-version stack in one pnpm global project under `$PNPM_HOME` → only `setup-shell` (+`setup-global-bin`) and `verify-readiness`, no `add -g`).
