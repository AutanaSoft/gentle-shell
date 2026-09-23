# Pin Gentle AI v3.6.1 and release gentle-pi v3.6.0

Repository-relative locator: `odd/tasks/pin-gentle-ai-3.6.1-release.md`

## Objective and rationale
Ship gentle-pi v3.6.0 with the published Gentle AI v3.6.1 pin rather than the older v3.6.0 pin. Approved issue: https://github.com/Gentleman-Programming/gentle-shell/issues/1362. Upstream release: https://github.com/Gentleman-Programming/gentle-ai/releases/tag/v3.6.1.

## Scope and constraints
- Worktree: `1362-pin-gentle-ai-3.6.1`; branch `fix/1362-pin-gentle-ai-3.6.1`, starting from origin/main `5df9590e`.
- User authorized PR, push, tag, GitHub Release and GitHub Actions publication for `Gentleman-Programming/gentle-shell` using the current authenticated gh and Git sessions. No local npm publication.
- Pin only published v3.6.1 archives, extracted binaries and Windows module Sum with verified provenance; regenerate derived modules, never hand-edit.
- No retagging; tag only the exact published main head; GitHub Actions dispatch from main. Delivery strategy: ask-on-risk. Forecast: 50–150 authored lines for the pin and release metadata, subject to contract comparison; generated modules excluded from the authored count.
- Effective TDD: strict, source `openspec/config.yaml`, runner `pnpm test` (read-only exploration evidence). Observe RED then GREEN and refactor for implementation.

## Tasks
- [ ] T1 — Pin the published Gentle AI v3.6.1 artifacts, update any evidence-backed contract metadata, regenerate runtime modules and update tests/docs as needed. Route: delegated writer (multi-file write and preparation triggers). Acceptance: verified provenance, focused tests and packed runner against published assets, full `pnpm test`, package consistency; Conventional Commit on feature branch, commit and RDD outcome recorded.
- [ ] T2 — Deliver the pin PR linked to #1362 and release gentle-pi v3.6.0 from the merged exact main head. Route: parent release coordination, bounded delegated verification where appropriate. Acceptance: checks pass, PR merged under repository policy, annotated tag and GitHub Release with canonical notes, successful `publish.yml` dispatch from main, npm version/dist-tag verified, release validation linked; commit/tag/run identities recorded.

## Progress and verification evidence
- Issue #1362 is open, `status:approved`, `type:chore`; prior pin PR #1344 merged. Upstream v3.6.1 release has four platform archives and signed checksums. Local branch clean and at `origin/main`; `package.json` is already v3.6.0.
- T1 pending; T2 pending. No source modifications or tests yet.

## Next step
Verify published release assets/contract and dispatch one bounded writer for T1. No release tag until T1 is merged and all gates pass.
