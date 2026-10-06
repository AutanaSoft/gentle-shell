# 1064 live orchestrator — apply and snapshot the live session model at profile selection

Session-bound profiles umbrella (gentle-shell#1064). Slice after 3a (#1557/#1558, merged) and beside 3b-i (noxsystems) / 3b-ii (matraket). Closes the two remaining orchestrator gaps reported in the thread.

## Specs

S1 — Enter applies the live orchestrator. Quote (LCubero, issue thread):
> For the proposed **Use in this session** behavior, please include both sides explicitly: capture the live parent model/effort from the session, and apply the selected profile through Pi's current-session APIs (`pi.setModel()` and `pi.setThinkingLevel()`). Persisting `default*` should remain the separate global-default action.

Behavior: Enter in `/gentle:profiles` binds the session (unchanged, slice 1) AND switches the live session to the profile's orchestrator entry through the existing `switchLiveOrchestrator` seam (`extensions/gentle-ai.ts:4192`, from #1221). No file writes of any kind. A profile without an orchestrator entry leaves the live model untouched — the same "must never move the orchestrator" contract as `applyOrchestratorSettings` (`lib/profiles-orchestrator.ts:97`).

S2 — Enter notice must tell the truth post-#1558. Current stale text (`extensions/gentle-ai.ts:4261`):
> `The binding is stored for this session; launch routing is unchanged.`

Slice 2 (#1558, merged) made launch routing follow the binding (`session → p → P → global`), so the notice is factually wrong today, and S1 adds live-orchestrator switching. New notice states: launch routing follows the binding, this session now runs on the orchestrator entry when present (with the `switchLiveOrchestrator` note appended), and nothing was written.

S3 — `s` snapshot prefers the live session. Quote (LCubero, issue thread):
> Also, `s` snapshots the orchestrator through `readOrchestratorSettings(...)`, which captures the global defaults rather than `ctx.model` and `ctx.thinkingLevel` from the running session.

Behavior: the panel's `saveSnapshot` (`extensions/gentle-ai.ts:4834`) builds the profile's orchestrator entry from `ctx.model` + `ctx.thinkingLevel` when a live model exists, falling back to `readOrchestratorSettings` only when it does not. Verified current behavior on `origin/main@27a9fc5cc`: `profileSnapshotFrom(readEffectiveModelConfig(ctx.cwd), readOrchestratorSettings(orchestratorSettingsPath()))`.

S4 — PRD 6.3 decision honored (barbatdev, issue thread):
> 6.3: pursue the Pi API for model origin, argv only as a bridge.

Implementation uses Pi's extension API only (`ExtensionAPI.setModel`/`setThinkingLevel`, `dist/core/extensions/types.d.ts:1250-1260`), already proven by #1221's `LiveSession` pick. No argv bridging.

S5 — Boundary with concurrent slices. This slice touches ONLY: the `apply` (Enter) handler, the `saveSnapshot` closure, their notice texts, tests, and docs. It does NOT touch binding persistence (3b-i, noxsystems), startup freeze / drift / `follow` / origin display (3b-ii, matraket), or the `a` global path beyond shared-seam reuse. PR references `Part of #1064` (never `Closes`, per barbatdev 2026-10-06).

## Tasks

T1 · S1,S2 · inline · test-first · **DONE RED→GREEN** — `Enter applies the profile's orchestrator entry to the live session and writes nothing` + `Enter without an orchestrator entry leaves the live session model untouched` (RED verified: liveSwitches vacío + wording vieja; GREEN con T2).
T2 · S1 · inline · **DONE** — `apply` case: `readProfileOrchestrator(normalized)` + `switchLiveOrchestrator(ctx, live, entry)` tras `bindSessionProfile`; no-op sin entry (contrato de `applyOrchestratorSettings`).
T3 · S2 · inline · **DONE** — notice nueva: "Launches from this session resolve the binding ahead of pins and the global default.${liveNote}\nNothing was written..."; test :3608 actualizado al contrato post-#1558 (era la única aserción del wording slice-1).
T4 · S3 · inline · test-first · **DONE RED→GREEN** — `s snapshots the live session's orchestrator over the settings defaults` (RED: capturaba nan/deepseek-v4-flash de settings; GREEN con T5). Test `s` preexistente (:2784) sigue verde = fallback preservado.
T5 · S3 · inline · **DONE** — `liveOrchestratorSnapshot(ctx, live)` (model+thinking vivos, sin claim de thinking si falla la lectura) prefiriendo sobre `readOrchestratorSettings` en `saveSnapshot`.
T6 · S5 · inline · **DONE** — docs/readme-reference.md: fila `enter` reescrita (binding + live switch + cero writes), fila `a` agregada (deuda #1557), fila `s` y párrafo orchestrator + distinción `u`/`s` actualizadas; suite completa verde (unit-tests + provider-contract + runtime-harness); slice-plan posted (comment 6017044747); commits: feat + docs.

Deferred (ledger, no this slice): a dedicated "Session-bound profiles" prose section documenting the `(session)` status spelling and `session → p → P → global` precedence belongs to the umbrella docs pass once 3b-i/3b-ii land.

## Log

L1 — 2026-10-06 · user: "adelante gs#1064" (claim the next slice of the session-bound profiles umbrella; 3b-i is noxsystems, 3b-ii is matraket, orchestrator/default handling unclaimed).
L2 — 2026-10-06 · Exploration evidence (origin/main@27a9fc5cc): `a` path already switches live orchestrator (#1221, `switchLiveOrchestrator` at extensions/gentle-ai.ts:4192, `LiveSession = Pick<ExtensionAPI, "setModel"|"setThinkingLevel"|"getThinkingLevel">`); Enter handler stores binding only (extensions/gentle-ai.ts:4244-4263); `saveSnapshot` reads settings defaults (extensions/gentle-ai.ts:4834-4842); Pi extension API exposes setModel/setThinkingLevel for the current session without touching defaults (types.d.ts:1250-1260).
L3 — 2026-10-06 · Slice-plan comment drafted for #1064 (protocol: plan posted before PR).
L4 — 2026-10-06 · Slice plan POSTED: https://github.com/Gentleman-Programming/gentle-shell/issues/1064#issuecomment-6017044747
L5 — 2026-10-06 · RED: 3 tests nuevos fallando por las razones correctas (liveSwitches vacío; wording slice-1; snapshot desde settings), 115 existentes verdes. GREEN: suite completa `run-test-suite.mjs` all stages passed tras pnpm install real (el symlink de node_modules rompía provider-contract/runtime-harness). Descubrimiento: el clone main estaba 65 commits atrás y su `saveSnapshot` difiere del de origin/main (ya prefiere el binding para routing); la tabla de keys de readme-reference.md quedó stale desde #1557 (Enter viejo, sin fila `a`) — corregido en el commit de docs.
