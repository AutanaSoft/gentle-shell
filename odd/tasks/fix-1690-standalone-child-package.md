# Fix #1690: standalone subagents load the gentle-pi package

## Objective

In isolated standalone Gentle Shell, delegated children (`pi --mode rpc`) must load the same gentle-pi package as the parent. Acceptance target: an isolated child behaves like a regular gentle-pi child, where `settings.json` declares the package.

## Problem

In isolated mode the launcher injects the package into the parent only through `pi -e <packageRoot>` (`lib/gentle-shell-launcher.ts` `buildPiInvocation`, ~:918-947), and setup removes `npm:gentle-pi` from the isolated home `settings.json`. The runner never forwards that injection. `childArguments` (`lib/agents-runner.ts:258`) adds `--extension` only for `request.extensionPaths`, which holds just `child-context.ts` and `child-safety.ts` (`extensions/gentle-agents.ts:114`, `:148`, `:1304`). Children lose the guardrails gate, `subagent_parent_message`, session-change capture (#1688), codegraph, `gentle_review_scope`, the review permission relay, and package skills/prompts. Pi drops unknown `--tools` names silently.

## Decided direction

barbatdev on #1690 (2026-10-03 04:19Z):

1. Forward the parent's package to children when the parent received it through `-e`, not through `settings.json`.
2. Move the orchestrator-only filtering that `child-context.ts` does today into the fully loaded package. The curated child-entrypoint list goes away.
3. The runner warns when a tool requested in `--tools` does not exist in the child.

## Design constraints (verified on origin/main ac671593, Pi 1.0.0)

- No grandchildren: `agentsEnabled()` returns false when `GENTLE_PI_AGENTS_CHILD=1` (`extensions/gentle-agents.ts:152`).
- Prerequisite: `gentle-ai.ts` `session_start` (~:9673) has no child guard. It runs `installPackageAssets`, `migrateLegacyProjectModelOverrides` and `applySavedModelConfig` (~:9715-9717). Forwarding the package without a guard would make every child rewrite shared files. Regular gentle-pi children probably hit this today already.
- The launcher must signal the injection explicitly (env), not leave the child to infer it from argv or `import.meta.url`.
- Launcher cases: no declaration → forward `packageRoot`. Takeover (`--no-extensions` + other `-e` set) → forward the full set or define a scope. A declaration already in settings → forward nothing, or the package registers twice.
- Once the package is forwarded, drop `child-context.ts`/`child-safety.ts` from the child args, or make them idempotent.
- Pi 1.0 RPC has no tool listing (no `get_tools`). The missing-tool warning needs either a child-side self-check reported over the child IPC, or a parent-side check. Verify before choosing.
- Windows: pass paths as plain argv elements, absolute, with no shell quoting.
- Overlaps: #593 / PR #605 (child extension selection), #1688 (child capture; GuidoCarda has a local fix).

## Constraints

- Technical artifacts in English. Test-first wherever there is a deterministic runnable test.
- No PR until barbatdev answers whether to wait for `status:approved` (the issue has `status:needs-review,type:bug`).
- Out of scope: #1647, #1064/#1557/#1558.

## Tasks

- [x] T1 Hook audit: classify every gentle-pi package hook that would newly run in a child (session_start, before_agent_start, tool_call, timers, UI, registrations) as must-run, must-skip or harmless. Record the table in this document. Route: delegated read-only (`gentle-ai-explore`, task mus95p0g-1-r2m0); the parent spot-checked `hasUI` in the Pi rpc loader. See "Child hook audit". Commit `5848fb80`.
- [x] T2 Child guards for the must-skip items in "Child hook audit" (gentle-ai session_start writes, skill-registry, history, pi-pretty fallback, optional startup-banner), with tests. Route: delegated writer (musez9uu-2-2u6i), verified by `gentle-ai-verify` (musfh6tb-3-entu). The child also skips the review-permission revoke/refresh: the grant is host-only (`lib/review-session-standing-permission.ts:162`) and the child relay is created at load. Commit: see Evidence.
- [ ] T3 Launcher injection signal: `buildPiInvocation` exports the injected extension set (and the takeover flag) to the parent env for the three cases, with tests. Route: per the ladder.
- [ ] T4 Runner forwarding: gentle-agents builds the child extension args from that signal (takeover set with `--no-extensions`; nothing when declared) and drops the curated entries when the package is forwarded, with tests. Route: per the ladder.
- [ ] T5 Move the `child-context.ts`/`child-safety.ts` behavior into the loaded package, gated on `GENTLE_PI_AGENTS_CHILD`, with no double registration, with tests. Route: per the ladder.
- [ ] T6 Missing `--tools` warning: choose between a child self-check over IPC and a parent-side check (verify first), implement, test. Route: per the ladder.
- [ ] T7 Acceptance probe: spawn like the runner (`--mode rpc --session-dir <tmp>`, `GENTLE_PI_AGENTS_CHILD=1`, isolated home) and compare RPC `get_commands` with a regular gentle-pi child (baseline 18 `/gentle:*` vs 0); measure startup cost; update docs. Route: `gentle-ai-verify`.

## Child hook audit (T1)

Audited statically on ac671593 against Pi 1.0.0 `@earendil-works/pi-coding-agent/dist`.

**Loader facts**

- `pi.extensions: ["./extensions"]` has no `index.ts`. Pi loads every top-level `extensions/*.ts` file plus `extensions/history/index.ts`, 18 entrypoints in total (`package-manager.js:377-456`). `child-context.ts` and `child-safety.ts` are therefore already package entrypoints.
- Pi dedupes extension paths by canonical path, CLI paths first (`package-manager.js:2058-2062`, `resource-loader.js:316-318,656-668`). Forwarding `-e <packageRoot>` together with `--extension child-*.ts` loads each file once.
- In an rpc child, `ctx.hasUI` is **true**: `rpc-mode.js:231` binds an RPC UI context and `runner.js:363` defines `hasUI`. Every `hasUI` guard takes the UI branch in children. Select/confirm/input/editor calls become a task ASK to the parent (`agents-protocol.ts:154,332-333`). notify/setStatus/setWidget calls are dropped.

**Must-skip in children (new `GENTLE_PI_AGENTS_CHILD` guard)**

1. `gentle-ai.ts:9715-9717` session_start: `installPackageAssets(force)`, `migrateLegacyProjectModelOverrides`, `applySavedModelConfig`. All three write shared state.
2. `skill-registry.ts:631` session_start: writes `.atl/` into the child cwd, renames the legacy registry, and starts a recursive fs watcher (gated on `hasUI`, which is true).
3. `history/index.ts:1361-1399`: writer init, `before_agent_start` prompt capture (would record delegation prompts as user history), GC.
4. `pi-pretty.ts:42`: the `!shellEnabled` fallback loads upstream pi-pretty with FFF indexing per child.
5. Optional hardening: `startup-banner.ts:647` is skipped today only because a piped stdout has no rows/cols.

**Uncertain, decide in T2**

- `gentle-ai.ts:9683-9696,9744-9747` session_start repository-preparation binding and review-status negotiation (spawns the native CLI per child); `tool_result` `recordReviewMutation`/`prepareBoundSessionRepository` (`:9854-9866`).
- Guardrails `confirmCommand` (`gentle-ai.ts:1822-1828`): its headless block is skipped because `hasUI` is true, so commands classed "confirm" in a child would ASK the parent user and the task would wait. Today they run unprompted. **Decided by the user (2026-10-03): the child asks the parent for confirmation.** Keep the ASK path, no child bypass; cover it with a test.
- Parent decision for T2: the repository-preparation binding, startup review negotiation and `prepareBoundSessionRepository` belong to the parent session (the child already runs in the parent's resolved worktree), so skip them in children. Keep the child-local resets and `recordReviewMutation` (child session only). The writer verifies whether review-permission revoke/refresh must stay for the child relay.

**Must-run (gained by forwarding)**

The gentle-ai `tool_call` guardrails, review relay handshake and review tools; gentle-shell session-change capture (runs before the shell guard); gentle-agents child `subagent_parent_message`; codegraph; nan-provider; child-context and child-safety.

**Already harmless in children**

gentle-shell UI/timers, the gentle-agents host, gentle-todo, runtime-metrics, gentle-stats, resume-hint, ask-user-*, quiet-tools, and the gentle-ai `before_agent_start`/`agent_end` (child-guarded).

## Acceptance criteria

- An isolated standalone child exposes the same package commands and tools as a regular gentle-pi child.
- Child launches do not rewrite shared files (assets, agent frontmatter, `subagents.json`, project `.pi/settings.json`).
- The package registers exactly once in every launcher case (no declaration, takeover, declaration).
- A requested tool that is missing in the child produces a visible warning.

## Evidence

- T1: commit `5848fb80` (static audit; the loader facts were re-confirmed on Pi 1.0.0 during T2 verification).
- T2: RED→GREEN per guard (writer). Verification on a real `pnpm install --frozen-lockfile` with pi-coding-agent 1.0.0: focused tests 55/55; wider set 517/518, the one failure being `tests/history-session-scan-extract.test.ts:197` (mtime vs `Date.now()`, untouched code), which then passed 14/14 three times in isolation, so treated as a timing flake; `node scripts/check-types.mjs` gives the same result on the branch and on origin/main (186 recorded, no regressions). Loader facts on 1.0.0: rpc `hasUI` is true (`rpc-mode.js:230-232`, `runner.js:404-405`); `mergePaths` dedupes by realpath with the CLI paths first (`resource-loader.js:403-405,781-792`). Commit: the T2 commit carrying this line.
