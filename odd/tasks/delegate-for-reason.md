# Delegate for a reason, not for size (gentle-shell#1731)
Branch: `feat/1731-delegate-for-reason` (base `origin/main` 5d75a2ab) · Worktree: `/home/gentleman/work/gentle-pi-1731` · Bench repo: `~/work/gentle-shell-bench` (local, private)
Engram mirror: `odd/delegate-for-reason/tasks` · Runner: `node --experimental-strip-types --test <file>`; full `npm test`, `npm run typecheck`

## Specs
S1. Delegation reasons, not size: "si la tarea es grande, porque es grande y ya está, pero a ver, no pasa nada con agregar la bitácora y tener ahí el orquestador siguiendo la bitácora, ya está, bien. Acá lo que tenemos que ver es, es una tarea grande, por lo cual se puede paralelizar trabajo." A large task keeps the ODD logbook (resume test, #1494) but delegation needs its own reason: parallelism, model routing, context, or (verify only) high-risk independence. Without a reason the orchestrator works inline following the logbook.
S2. Parallelism, medium tasks included: "si nosotros tenemos una tarea mediana, ¿bien? Si vale la pena, por ejemplo, delegar en varios workers para poder llegar al resultado y lo paralelizo." and "paralizar solo si compensa". Parallelize only when there are 2+ independent units with disjoint files, each clearly heavier than the cost of starting a subagent.
S3. Model routing per role: "si estoy haciendo algo bastante crítico y demás, yo puedo tener un perfil en el cual el Verify, no sé, es un Fable, por así decirlo, ¿bien? o es un Astra. y después para todo lo que es un Worker, lo bajo y puedo tener un Sol 6.1 o puedo tener un Opus." and "tengo un orquestador que es fable, que es un modelo que gasta muchísimo. Yo lo uso para razonar, para pensar. Lo que hacíamos antes es tener un worker, ¿para qué? Para poder asignar un modelo más chico." The runtime computes the orchestrator/worker price ratio from the assigned models and catalog prices and injects it as a fact; a high ratio (about 3x or more) delegates implementation of anything beyond a trivial single edit; ratio 1 keeps the #1494 inline path.
S4. Verify stays risk-gated: "lo del verify, sí que lo dejaría así como lo tenemos ahora, bien, que es prácticamente según el riesgo que lo da el agente."
S5. Worker self-review: "lo de que cada worker se revise a sí mismo." Each worker self-reviews in its own session (spec from the logbook, the request's examples, tests, typecheck), fixes and continues; low and medium risk need nothing else.
S6. Parallel independent verify on risk: "Si uno de esos workers está tocando cosas que son peligrosas o algo así y el orquestador lo identifica cuando recibe el resumen del worker, ahí ejecutar un verify independiente. ¿Por qué te lo digo de esta manera y que no haga el verify inline el orquestador? Porque si hay más de uno y si más de uno termina al mismo tiempo, tendrían que ser varios verify al mismo tiempo, ¿se entiende? Entonces podemos delegarlo en múltiples verify." Accepted refinement (L4): the trigger is objective, `assess` over that worker's actual diff or the worker's own `escalate`, not only the prose summary.
S7. Seam check (accepted, L4): after parallel units finish, the parent runs one inline full-suite command (existing parent spot check).
S8. Bench: "corras los bench utilizando estas configuraciones para ver cómo funciona, ¿sí? agregando los casos extras que tú dijiste." Extra cases: two independent features (parallel vs serial vs inline with logbook), expensive-orchestrator profile (inline vs delegated implementation, break-even), large-task replicates. Before = origin/main 5d75a2ab, after = this branch, pinned product builds.

### Acceptance criteria
- AC1 (S1) [contract] the writer mechanism fires on named reasons (parallelism, model routing, context backstop); "large task -> one worker per task" is gone; a large task without a reason works inline and still keeps the logbook.
- AC2 (S2) [contract] parallelism trigger: 2+ independent units, disjoint files, each heavier than subagent start cost.
- AC3 (S3) [unit+contract] runtime computes the orchestrator/worker input and output price ratio from `ctx.model`, the effective `gentle-ai-worker` model and catalog `cost`; renders one fact line (or "unknown"); ratio >= 3 delegates implementation beyond a trivial single edit; ratio < 3 keeps #1494 inline.
- AC4 (S4) [contract] verification rule unchanged: independent verify only for high risk.
- AC5 (S5-S7) [contract] parallel review protocol: self-review per worker; per-worker independent verify, in parallel, only when assess over that worker's diff or its escalate says high; one inline full-suite seam check after parallel units.
- AC6 (S2) [unit] concurrent writers admitted only with disjoint `## Allowed edit surfaces`; overlapping live writer is rejected with a clear message; single-writer text relaxed to "unless surfaces are disjoint or worktrees are isolated".
- AC7 [contract] always-on core stays <= 8,192 B; lazy module budgets hold.
- AC8 (S8) [bench] new scenarios committed in the bench repo; before/after runs reported with cost, wall time, acceptance, subagents.
- AC9 [all] `npm test` and `npm run typecheck` pass; tests pinning old wording change in the same commit.

## Tasks
- [x] T1 (S3, AC3) delegated writer (reason: context backstop; profile uniform, ratio 1.0x) · runtime price-ratio fact (`lib/model-price-ratio.ts`, harness injection).
  Writer musucqhs-2-ob1l: RED (ERR_MODULE_NOT_FOUND x2 + 4 prompt assertions) -> GREEN 23/23; typecheck no regressions; npm test 4718/4718 with
  `env -u GENTLE_PI_AGENTS_CHILD` (1 known env-only failure inside subagents). Parent spot check 23/23. Risk medium. RDD consent declined for this
  candidate (no native review). Kernel rule "ratio >= 3 delegates" deferred to T2.
- [ ] T2 (S1-S4, AC1-AC4, AC7) delegated writer · kernel: writer mechanism by reasons within byte budget; ratchet/contract tests (pi leads wording)
- [ ] T3 (S5-S7, AC5) delegated writer · parallel review protocol in the verification/writer lazy modules
- [ ] T4 (S2, AC6) delegated writer, HIGH risk (concurrency) + independent verify · disjoint-surface writer admission; relax single-writer text
- [ ] T5 (S8, AC8) delegated writer in bench repo · scenarios x5 (two independent features) and expensive-orchestrator profile; pin before/after products
- [ ] T6 (S8, AC8) runs · bench before/after and report (stage cap reuses user's USD 60 approval)
- [ ] G1 other repo, needs user OK · port kernel wording to gentle-ai canon (`routing.go`) with parity
- [ ] G2 other repo, needs user OK · gentle-ai `review start` accepts escalate (RDD alignment)

## Log
L1 2026-10-03 user (verbatim): > Y ahora que ya la tienes, lo que quiero que hagas es que hagas tú las implementaciones en GentleP, bien, en lo que sería GentleShell, y corras los bench utilizando estas configuraciones para ver cómo funciona, ¿sí? agregando los casos extras que tú dijiste.
L2 2026-10-03 issue created: https://github.com/Gentleman-Programming/gentle-shell/issues/1731
L3 2026-10-03 mapping (explorer mustzvgh-n-go5f): core assets/orchestrator.md mechanisms :51-59 (writer :55, verify :53, backstop :59), Safety single-writer :86; delegation.md :45,:52,:62,:114,:155; harness extensions/gentle-ai.ts:1291; skills/gentle-ai/SKILL.md:21. Canon fixture generated from gentle-ai, pinned by tests/odd-routing-canonical-ratchet.test.ts, odd-routing-contract.test.ts:317-376, task-size-routing-contract AC4/AC7, orchestrator-budget (8,192 B, core ~8,084 B). Runtime: before_agent_start gentle-ai.ts:9829-9897 -> buildGentlePrompt :1245-1297; worker model resolved inline gentle-agents.ts:1326-1337; prices via ctx.modelRegistry.find -> cost. Single writer is prompt-only (runner maxConcurrency 5, admission only checks surfaces exist). assess cannot scope to one writer's tracked paths: use sequential work-unit commits + baseRef or per-writer worktree.
L4 2026-10-03 accepted in discussion: risk trigger from assess over the worker diff or worker escalate (not only summary); seam check after parallel units; runtime-computed ratio; contract-first and end-only integration verify rejected by user.
L5 2026-10-03 user (verbatim): > Vamos a por el
L6 2026-10-03 forecast: T1 ~200, T2 ~150, T3 ~100, T4 ~300 authored changed lines in gentle-pi (~750) -> above ~400; delivery strategy ask-on-risk asks for the chain strategy before the first commit.
L7 2026-10-03 user (answer): delivery > Un PR con size exception (single-pr, work-unit commits per task, size:exception label).
L8 2026-10-03 user (verbatim): > Acordate que después, cuando vayamos a hacer esta paridad para Chatly AI, vamos a tener un problema, porque damos soporte a muchísimos agentes. ¿Y cómo hacemos para que esos agentes puedan menevalor el coste de los subagentes? ¿Se entiende lo que te quiero decir? No todos creo que lo dan eso, eh? No es el momento para hacer un control agente por agente de todo esto.
   decision (constraint for T2/G1): the cost rule is fact-gated with a safe default. Canon wording: delegate implementation only when the runtime REPORTS a price ratio >= ~3x; when no ratio is reported, the cost reason does not fire and #1494 behavior holds. Parallelism, context and risk reasons need no prices and work in every agent. Parity = copy text verbatim, no per-agent work. Optional later: gentle-ai computes the ratio at sync from the role models it configures and stamps it as a static fact.
