# Pin Gentle AI v3.7.0 and release Gentle Shell v3.7.0

Repository-relative locator: `odd/tasks/pin-gentle-ai-3.7.0-release.md`.

## Objective and rationale
Publish Gentle Shell with the newly released Gentle AI v3.7.0 instead of its v3.6.1 pin, while shipping the cross-repository subagent work already merged into main. Approved issue: https://github.com/Gentleman-Programming/gentle-shell/issues/1376. Upstream: https://github.com/Gentleman-Programming/gentle-ai/releases/tag/v3.7.0.

## Scope and constraints
- Branch `chore/pin-gentle-ai-3.7.0`, starting from `origin/main` `3fd73a5f9ae22da38db6218966317b9883c7fd2b`.
- Authorized GitHub repositories: Gentleman-Programming/gentle-ai and Gentleman-Programming/gentle-shell, using the current `gh` session; publish npm only via `publish.yml`, Homebrew via the Gentle AI workflow. No ambient SSH or local npm publication.
- Pin only published signed v3.7.0 assets and Windows SumDB source; verify contract identity, regenerate derived runtime modules, never hand-edit generated files. No retagging; tag from exact merged `main`.
- Delivery strategy: ask-on-risk. Forecast: 150–250 authored changed lines across pin/tests/docs and release version; generated runtime excluded. Reassess before PR if above ~400.
- Effective TDD: strict, source `openspec/config.yaml` / preceding pin task evidence; runner `pnpm test`. Observe RED then GREEN. Check `pnpm test`, `pnpm run check:runtime-modules`, `node scripts/verify-package-files.mjs`, `node scripts/test-packed-runner.mjs`, `npm pack --dry-run`.

## Tasks
- [x] T1 — Update the pinned published Gentle AI release (archive/binary digests, Windows SumDB), capability row, generated runtime, tests and relevant docs. Route: delegated writer; multi-file write/preparation triggers. Acceptance: signed assets and contract verified; RED/GREEN recorded; functional and packed checks pass; Conventional Commit on feature branch, RDD assessment/outcome recorded.
- [ ] T2 — PR linked to approved #1376, merge after checks, bump npm package version on current main and release Gentle Shell v3.7.0 via an annotated tag, canonical notes and `publish.yml` on `main`. Route: release coordination and verification. Acceptance: exact SHA and tests, GitHub release, Actions success, npm version/dist-tag and notes confirmed; work-unit commit evidence recorded.

## Progress and verification evidence
- The v3.7.0 upstream release completed preflight/release/verify in run 35865455889; Homebrew formula version verified. Shell main CI and Windows checks green at base. Issue #1376 approved by the authenticated organization owner; label read back.
- T1 complete in `86c4b320b57a050e584a58602adf9c4ef9a565e0` (`feat(runtime): pin published gentle-ai v3.7.0`); route: delegated writer. Parent committed the verified work unit under the authorized ODD release scope. RDD assessment high (`process_boundary`); four-lens native lineage `review-aad6eb071519fdbb` approved and acknowledged, authority burned. Independent verifier reran 66 focused tests: 66 passed, 0 failed. Authored changes in T1: 188 lines including this task file. T2 pending. Signed archive and extracted binary hashes, Windows SumDB checksum, and unchanged provider-contract 1.2.0 / SHA-256 547b68e172cc87aa297309d61624e5fc2c24d407a494b53eeb5a2b053904352c were supplied by the parent as verified release evidence. RED: `node --experimental-strip-types --test --test-name-pattern='published Gentle AI v3.7.0 is the installer pin' tests/gentle-ai-installer.test.ts` failed (`3.6.1 !== 3.7.0`). GREEN: 429/429 focused touched tests passed; `pnpm test` passed (3360 passed, 38 platform skips) after correcting a test-fixture version mismatch observed in the first run; `pnpm run check:runtime-modules`, `node scripts/verify-package-files.mjs`, and `node scripts/test-packed-runner.mjs` passed (packed gentle-pi 3.6.0 with Gentle AI 3.7.0). Runtime generated with `pnpm build:runtime-modules`; only `runtime/native-review-cli.mjs` changed. Rollback boundary: the T1 installer pin, capability row, generated runtime row, pin-specific tests and docs; preserve every native authority store and receipt and never execute a downgraded binary against those stores. No push, PR or Gentle Shell release yet. Full Engram task-document mirror remains pending due this session's gentle-ai project binding.

## Next step
T2: push the pin branch, open and merge the issue-linked PR after checks, then bump the package version and publish the exact main head via Actions.
