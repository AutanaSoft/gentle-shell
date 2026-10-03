# Proportional task routing (gentle-shell#1494)
Branch: `fix/1494-small-task-overhead` (base `origin/main` cf3012f7) · Worktree: `/home/gentleman/work/gentle-pi-1494` · Delivery: single-pr with size exception (L14) · Runner: `node --experimental-strip-types --test <file>`; full `npm test`, `npm run typecheck`
Engram mirror: `odd/proportional-task-routing/tasks` · Route: inline for every task (L1: "sin delegar")

## Specs
S1. Scope: "la 4 y 5 no se tocan, los otros si". In scope: cause 1 (Verification rule contradicts Inline Direct), cause 2 (classification counts steps), cause 3 (writer and evidence triggers count files and lookups). Out of scope: cause 4 (gentle-engram memory protocol) and cause 5 (RDD review behavior).
S2. Small vs large: "definamos muy bien que es una tarea chica o grande, desde cuando hay que hacer todo el prcoeso o no". A task is small when all three hold:
    - Understood: the outcome is specified, what and where to change is known, no open product or design decision; proven within one bounded read batch (~3 calls, ~10k tokens).
    - Contained risk: it touches no high-risk item (S5).
    - Resume test: "Si la sesión se cortara ahora, ¿alguien podría terminar el trabajo solo con el pedido original y el `git diff`?" Yes → small.
    Never classify by number of files, commands or tests, fixes, or a requested todo list.
S3. Large means only: the resume test fails (multiple sessions, waits on something external, separate deliverables, or long requirements that compaction could lose). Large turns on the full process: feature doc + Engram mirror + todo, writer delegation, work-unit commits. Small runs inline: read, edit (several files of one understood change included), focused test and suite once each, RED observed inline, no explore/worker/verify, no feature doc or mirror, no commits unless asked, todo optional.
S4. Per-mechanism escalation: "en la escalada, hay que escalar TODO? o por ejemplo si hay una decision de diseño que luego de definirse sigue manteniendo lso anteriores criterios para no delegar, o por ejemplo hace falta leer mas, por ahi solo hciendo un explore ya estaria." Each mechanism turns on only by its own trigger; after it resolves, re-evaluate and stay small when the criteria still hold:
    | Mechanism | Trigger |
    | Ask the user | open product or design decision |
    | Delegated explore | understanding needs more than one bounded read batch |
    | Independent verifier | high risk (S5) |
    | Feature doc + mirror + work-unit commits | resume test fails |
    | Delegated writer | the task is tracked (resume test fails) or the ~150k context backstop |
S5. High risk: "que es alto riesgo?" A change is high risk when a mistake would be hard to detect, hard to undo, or reaches beyond the change. It touches any of:
    1. Data or irreversible effects: migrations, deleting or rewriting persisted data, persisted formats.
    2. Security: auth, permissions, credentials, secrets, guards or sandbox.
    3. Contracts others consume: public API, CLI flags, config formats, published exports, prompts or contracts another repo mirrors.
    4. Concurrency: locks, races, async ordering.
    5. Delivery or environment: installers, release, CI, deploy, dependency changes.
    6. No safety net: no test would catch a regression in what changes.
    "Unclear" counts as high only when a bounded look cannot tell whether items 1-5 apply. When RDD is on and native assess returns a tier, that tier wins.
S6. Agent-raised risk: "que el agente defina segun nuestros criterios que es algo que amerite una verificacion o un RDD". Accepted design (L9): the agent may raise risk citing an S5 item, never lower it; lowering stays deterministic in Go. With RDD on, the raise travels as a field of the existing assess call (no new call): `{"operation":"assess","escalate":{"item":2,"reason":"..."}}`. The field does not exist today ("para el 2, entonces no habria que hacer nada porque ya viene el escalado de golpe y listo no?" → L11): it needs gentle-ai G2, the gentle_review facade, and the rule text.
S7. Efficiency axes: "1- reduccion en consumo de tokens, 2- tratar de que sea mas ingreso que egreso de los mismos, 3- latencia, 4- contexto cargado en el agente por las reglas, ver como hacer lazy loading".
    - The small path reads no lazy rule file: the always-on kernel holds everything it needs.
    - `assets/orchestrator-delegation.md` (49 KB) splits into per-mechanism modules, each with a byte budget, loaded only when its mechanism turns on.
    - The always-on prompt does not grow beyond the current 8,192 B budget.
    - Prefer input over output: reference instead of copy, edit instead of rewrite, mechanical work done by code instead of the model.
S8. Replication: "todo lo que hagamos ahora se tiene que replicar para los otros agentes de gentle-ai". Pilot in gentle-pi, measure, then port to the gentle-ai canon (`internal/components/agentguidance/routing.go`) with a parity check.
S9. Measurement: bench baseline (origin/main cf3012f7) vs after, same scenarios: #1494 three-bug fixture; Alan's two small bugs; a known-large task; a risky change in an innocently named file; a task with a design decision mid-way. Metrics: input, output and cache-read tokens, input/output ratio, wall time, turns, subagents, always-on bytes.

### Acceptance criteria
- AC1 (S2) [contract] one canonical definition of the three criteria; other files reference it, never restate it.
- AC2 (S2) [contract] the text says file, command/test, fix counts and a todo request never classify; "two or more meaningful implementation steps" has 0 occurrences in extensions, assets, the skill and docs (the canon fixture changes only with G1, L15).
- AC3 (S3) [contract] Inline Direct allows running the focused test and suite inline; "only a read-only check within the evidence budget stays inline" is gone; Simple Delegation no longer cites "running focused tests/builds" for small work; test-first RED stays.
- AC4 (S4) [contract] the five mechanisms with their triggers and the re-evaluate rule; the writer trigger no longer counts files.
- AC5 (S5) [contract] the high-risk list exists once in gentle-pi; native tier wins when available; "unclear" bounded as in S5.
- AC6 (S6) [contract+unit] gentle_review assess accepts `escalate` with item 1-6 and a reason; anything else is rejected; never lowers (blocked on G2 for native effect).
- AC7 (S7) [contract] always-on render ≤ 8,192 B; no lazy module referenced on the small path; each lazy module under its byte budget.
- AC8 (S9) [bench] #1494 fixture: 0 `subagent_run`, 0 files under `odd/tasks/`, 0 commits, tests 3/3; Alan's shared-logic bug: 0 explore/worker/verify, hidden tests pass; known-large task still creates the doc and delegates; design-decision task continues inline after the answer; risky-innocent-path task gets raised risk.
- AC9 [all] `npm test` and `npm run typecheck` pass; tests pinning old wording change in the same commit.

## Tasks
- [ ] T0 (S9) in progress · baseline bench in `~/work/gentle-shell-bench`, arm B on s1-tasklog, s2-ledger, l1-tasklog (L16); new scenarios pending
- [x] T1 (S1-S5, S7) inline · always-on Task Size + Mechanisms in assets/orchestrator.md; harness Classify/steps 5-6; delegation, skill, readme aligned; contract tests · RED→GREEN · this work unit
- [ ] T2 (S7) inline · split orchestrator-delegation.md into per-mechanism lazy modules with byte-budget tests
- [ ] T3 (S5, S6) inline · high-risk list in the verification module; `escalate` field in the gentle_review assess facade
- [ ] T4 (S7) inline · output reduction: edit-not-rewrite rule; spike mechanical Engram mirror of `odd/tasks/*.md`
- [ ] T5 (S9) inline · bench after; AC8 verdicts
- [ ] G1 (S8) other repo · port the kernel to the gentle-ai canon with parity
- [ ] G2 (S6) other repo · gentle-ai assess accepts escalate-only agent raise
- [ ] G3 (S6) other repo · deterministic lowering accuracy using the Laya/Kev corpus (40 RDD candidates + 113 ODD commits)
- [ ] F1 follow-up issue · Pi loads the canon twice (`~/AGENTS.md` + gentle-pi injection)
- [ ] F2 follow-up, needs user OK (touches cause 5 loading only) · skip the RDD contract mirror when RDD is off

## Log
L1 2026-10-03 user (verbatim): > sin delegar y en nuevo worktree, vamos a analizar https://github.com/Gentleman-Programming/gentle-shell/issues/1494
L2 2026-10-03 analysis: cause 1 assets/orchestrator.md:41 vs :58, orchestrator-delegation.md:141,179,194-200; cause 2 harness Classify "two or more meaningful implementation steps" (extensions/gentle-ai.ts) and orchestrator-delegation.md:75; cause 3 orchestrator.md:54-55, orchestrator-delegation.md:137-138; cause 4 gentle-engram protocol; cause 5 contracts/review-provider-contract-mirror/v1.2.0/bundle/orchestration/pi.md:7. Pinned by tests/odd-routing-contract.test.ts:270,279, tests/rdd-aware-verification-contract.test.ts, tests/orchestrator-budget.test.ts:356, fixtures/odd-routing-canonical.md.
L3 2026-10-03 user (verbatim): > la revision obligatoria es de RDD?
   finding: yes, and RDD is off by default (extensions/gentle-ai.ts:5376).
L4 2026-10-03 user (verbatim): > la 4 y 5 no se tocan, los otros si, definamos muy bien que es una tarea chica o grande, desde cuando hay que hacer todo el prcoeso o no
L5 2026-10-03 user (verbatim): > dfine para cada item un acceptance criteria
L6 2026-10-03 user (verbatim): > ojo con algo, en la escalada, hay que escalar TODO? o por ejemplo si hay una decision de diseño que luego de definirse sigue manteniendo lso anteriores criterios para no delegar, o por ejemplo hace falta leer mas, por ahi solo hciendo un explore ya estaria. Luego tambien... que es alto riesgo?
   finding: gentle-pi has no written high-risk list; the tier comes from native assess (orchestrator-delegation.md:101,181-186).
L7 2026-10-03 user (verbatim): > que es C, y vale la pena retomar? o que tiene seguimiento?
L8 2026-10-03 user (verbatim): > el  ASSESS nativo de gentle-ai tenemos que cmbiarlo entonces para lo nuevo que estamos haciendo y que el agente defina segun nuestros criterios que es algo que amerite una verificacion o un RDD
L9 2026-10-03 user (verbatim): > es que todo lo que hagamos ahora se tiene que replicar para los otros agentes de gentle-ai, pero sabes que pasa? no tienes en memoria los experiemntos que hicimos con un modelo intermedio para definir el nivel de severidad tanto para odd como rdd? el determinismo funciona pero no es un accurate ahora mismo
   evidence (gentle-ai Engram 20843-20845, PR #4971): Go heuristic uses paths + a small regex and leaves small active code at medium; Laya real-diff AUC 0.57; Kev-4B AUC 0.74, 7.1% ODD escalations, ~4/8 justified, ~1.4 s/commit, ~18 GB; both blind to weakened auth in innocent paths and secret leaks.
   user (verbatim): > dale  (accepting escalate-only: agent raises, never lowers; lowering stays deterministic)
L10 2026-10-03 user (verbatim): > dale, dame toda la planificacion y piensa tambien como hacerlo de esta manera 1- reduccion en consumo de tokens, 2- tratar de que sea mas ingreso que egreso de los mismos, 3- latencia, 4- contexto cargado en el agente por las reglas, ver como hacer lazy loading
   measured: always-on orchestrator.md 7,599 B; harness block ~5 KB; RDD mirror pi.md 8,509 B always injected; orchestrator-delegation.md 49,435 B lazy but monolithic; gentle-ai-worker.md 10,969 B per worker.
L11 2026-10-03 user (verbatim): > para el 2, entonces no habria que hacer nada porque ya viene el escalado de golpe y listo no?
   finding: assess accepts only baseRef/committedOnly/writerModelId/writerEffort (extensions/gentle-ai.ts:890-916); "escalated" in lib/native-review-cli.ts:240 is a recovery disposition, unrelated.
L12 2026-10-03 user (verbatim): > ok escribe todo en un odd y vamos a darle!!
L13 2026-10-03 forecast: T1 ~250, T2 ~1,000 mostly moved lines, T3 ~150, T4 ~150 authored changed lines; above the ~400 budget, so ask-on-risk asks for the chain strategy before the first commit.
L14 2026-10-03 user (answers): chain strategy > pr con size exception · T0 bench > Sí, autorizo (read and run `~/work/gentle-shell-bench`, 5 scenarios against origin/main cf3012f7).
L15 2026-10-03 T1 evidence (risk: medium, prompt-contract change; route inline per L1; checks: self-verification, no delegation per L1):
   RED: tests/task-size-routing-contract.test.ts 5/5 failed on missing `## Task Size` / `## Mechanisms`.
   GREEN: 8 prompt-contract files 154/154; unit stage 4619 pass / 0 fail / 44 skipped; provider-contract and runtime-harness pass when run directly (`npm test` stages fail only on `pnpm run` deps check over the symlinked node_modules: ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY, environmental); `npm run typecheck` no regressions.
   Sizes: core render 7,704 → 8,035 B (budget 8,192); full always-on prompt 14,586 → 15,049 B (+463 B for the decision kernel). The core now points at the harness test-first policy instead of restating it.
   Decisions: the canon fixture and ratchet canonical anchors stay (they mirror gentle-ai); the ratchet marks writer/mapping as "Gentle Shell leads the canon (gentle-shell#1494)" until G1. Trigger list renumbered 1 Ask, 2 Evidence-budget, 3 Verification, 4 Track, 5 Writer, 6 Incident, 7 Context backstop; step 6 commits apply to tracked tasks only.
   Conflict ahead: gentle-shell#1713 (fix/1713-spec-by-reference) also edits harness steps 5-6; rebase after it merges.
L16 2026-10-03 T0 baseline (product copy of 4.0.0 with gentle-pi replaced by `npm pack` of cf3012f7 at /var/tmp/gentle-shell-bench/product/base-cf3012f7; config bench.1494-base.json; run id base1494): B s1-tasklog accepted at round 0, 315 s, 45 turns, $0.279 (vanilla A from pilot-s1: 56 s, 6 turns, $0.062).
