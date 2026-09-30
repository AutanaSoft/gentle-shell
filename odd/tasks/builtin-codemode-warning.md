# Builtin codemode startup warning

Locator: `odd/tasks/builtin-codemode-warning.md` · Engram mirror: `odd/builtin-codemode-warning/tasks`
Branch: `fix/builtin-codemode-warning` (from `origin/main`)

## Objective

Remove the Pi 0.99 startup warning `Extension package "builtin:codemode": ... quiet-tools.ts registers tool codemode, so built-in extension codemode was not loaded` while keeping gentle-pi's compact codemode renderer, and fix the startup banner MCP server count.

## Problem / why

- Pi 0.99.1 ships replaceable builtins `codemode`, `tool-search`, `mcp` (plus non-replaceable `llama.cpp`). `omitReplacedExtensions` (`dist/core/resource-loader.js:71-101`) always warns when a replaceable builtin loses to another extension.
- gentle-pi intentionally replaces `codemode` (`extensions/quiet-tools.ts:805` -> `registerCompactCodemode`, `lib/codemode-renderer.ts:177`) to decorate its renderer. Pi exposes no API to decorate another extension's tool renderer (`ToolInfo` lacks renderCall/renderResult).
- The only per-builtin exclusion is `-builtin:<name>` in the settings `extensions` array (`dist/core/package-manager.js:737-743`). No CLI flag or env var exists.
- `extensions/startup-banner.ts:688` counts MCP servers from `~/.pi/agent/mcp.json` instead of the active agent dir, so the banner count is wrong under Gentle Shell (`~/.gentle-shell/agent`).

## Decision (user, 2026-09-30)

Option A: the launcher idempotently ensures `-builtin:codemode` in the `extensions` array of the isolated Gentle Shell home `settings.json` (same precedent as default theme enforcement). Never edit settings in `--link` mode (user-owned pi home) nor on `--dry-run`. Preserve all other keys and existing `extensions` entries; never duplicate; respect an explicit user `+builtin:codemode`/`!builtin:codemode` entry.

## Scope / constraints

- In scope: launcher settings enforcement + tests; banner MCP path + test if feasible.
- Out of scope: takeover path dropping builtins `mcp`/`tool-search`/`llama.cpp` via `--no-extensions` (`lib/gentle-shell-launcher.ts:915-916`) — reported as follow-up, not authorized yet.
- Test-first where a deterministic test exists (`node --experimental-strip-types --test tests/gentle-shell-bin.test.ts`).

## Tasks

- [x] T1 — Launcher ensures `-builtin:codemode` in isolated home settings `extensions` on launch (not `--link`, not `--dry-run`), idempotent, with tests. Route: delegated (writer trigger: launcher + tests, 2+ non-trivial files). Risk: high (edits user-visible settings file, installer/launcher).
- [ ] T2 — Startup banner reads `mcp.json` from the active Pi agent dir (`PI_AGENT_DIR`) instead of `~/.pi/agent`. Route: delegated with T1 writer (same session, separate commit). Risk: medium.

## Acceptance criteria

- Launching Gentle Shell in isolated-home mode no longer prints the builtin codemode warning; builtin `mcp`, `tool-search`, `llama.cpp` still load.
- Settings file keeps all other keys byte-stable where possible; second launch produces no change.
- `--link` home settings are never modified.
- Banner MCP count reflects `<agentDir>/mcp.json`.

## Delivery

Forecast: ~150 authored changed lines. Strategy: `ask-on-risk` (under budget, single PR). Push/PR are user decisions.

## Progress / evidence

- 2026-09-30: exploration done (subagent muomyim4-1-7dwb). Branch created.
- 2026-09-30 T1 (delegated writer, risk high): logic lives in `bin/gentle-shell.mjs` (`withBuiltinExtensionExcluded` pure helper + `ensureBuiltinCodemodeExcluded` atomic write, called in `main` after auto-provision, wrapped in `safely`). Not in `lib/gentle-shell-launcher.ts` because bin imports the generated, tracked `runtime/gentle-shell-launcher.mjs`, which is outside the authorized edit surface.
  - Gate: normal launch only (`isolated`/`path`, no pi subcommand; `setup`/`--dry-run` return earlier), and only homes gentle-shell owns by the auto-provision rule (`homeIsForeign`): never `--link`, a foreign `--home`, or pi's default agent home.
  - Any explicit user entry (`+`/`-`/`!`/bare `builtin:codemode`), malformed JSON, non-object settings, or non-array `extensions` leaves the file untouched. A missing settings.json stays missing (only the new-home bootstrap seeds it). Indentation and trailing newline are preserved; one stderr notice on write.
  - RED: 4 positive bin tests failed with `extensions` `undefined` (5 guard tests already passed pre-change). GREEN: 9/9 new tests pass. Triangulation: mutating the ownership gate made the foreign/default-home test fail; reverted.
  - `node --experimental-strip-types --test tests/gentle-shell-bin.test.ts`: 123/123 pass.
  - `node scripts/check-types.mjs`: 187 recorded diagnostics, no regressions.
