# Spec-by-reference ODD handoffs (gentle-shell#1713)
Branch: `fix/1713-spec-by-reference` (base `origin/main` cf3012f7) · Delivery: ask-on-risk · Runner: `node --experimental-strip-types --test <file>`; full `npm test`, `npm run typecheck`
Engram mirror: `odd/spec-by-reference-handoffs/tasks` · Route: inline for every task (user: "para la tarea de hoy no quiero que delegues nada")

## Specs
S1. The ODD feature doc is the reference: "el doc .md de ODD se genera cuando realmente se necesita, además de eso, la idea es que sea una referencia. Este tendria que tener las specs ahi mismo y funciona estilo bitacora."
    Fixed order: header (2-3 lines) → `## Specs` → `## Tasks` → `## Log`. Stable content on top, growing log last.
S2. Specs quote, never summarize: exact strings, error messages and examples from the user stay literal, in the user's language. Specs may number and order, never rewrite those fragments.
S3. Change = only the affected spec and task: "A diferencia de SDD, un cambio no re hace todo, solo re hace esa spec y la tarea asociada". A change appends a verbatim user Log entry, rewrites only the affected S#, reopens only its T#.
S4. Log is the logbook: first entry L1 holds the original request verbatim; user corrections are logged verbatim; evidence and decisions go here, not in Tasks. Tasks stay one line each (S# links, route, commit, RED→GREEN).
S5. Handoffs pass a reference, not a paraphrase (goal: "minimizar el consumo de tokens y a la vez mantener la guia y calidad"):
    Spec: odd/tasks/x.md (read until "## Log"). Do T2 → S3, S4.
    Report covered S# and any S# you could not satisfy.
    Workers read until `## Log`; when no doc exists, the handoff carries the user's request verbatim. No "translate/condense the request" step.
S6. Verify is grounded in the specs: reads the whole doc including verbatim user Log entries, returns a per-S# verdict, executes the spec's `$` examples the parent authorized (isolated when they mutate state), compares exact output.
S7. User-reported failures are reproduced before the orchestrator decides they already work.
S8. Handoff friction never shrinks content (#1713 cause 5): writer-surface rejection names the offending line and says to resend the same task unchanged except the section; `subagent_continue` of a writer inherits the original task's surfaces when the follow-up has none; an unknown task id lists recent valid ids.

## Tasks
- [x] T1 (S1-S7) inline · doc format + handoff/verify/reproduce contract in assets, agents, extension ODD step, contract tests · RED→GREEN · 9e890dba
- [x] T2 (S8) inline · runtime friction in lib/bounded-writer-admission.ts and extensions/gentle-agents.ts + tests · RED→GREEN · commit: see L10
- [ ] T3 (S1-S6) pending user decision · port the doc format to the gentle-ai canon (`internal/components/agentguidance/routing.go`) and regenerate `fixtures/odd-routing-canonical.md`

## Log
L1 2026-10-03 user (verbatim): > quiero que hagamos esto, pero pimero lo analicemos super bien https://github.com/Gentleman-Programming/gentle-shell/issues/1713
L2 2026-10-03 user (verbatim): > espera para la tarea de hoy no quiero que delegues nada
L3 2026-10-03 user (verbatim): > es que el doc .md de ODD se genera cuando realmente se necesita, además de eso, la idea es que sea una referencia. Este tendria que tener las specs ahi mismo y funciona estilo bitacora. A diferencia de SDD, un cambio no re hace todo, solo re hace esa spec y la tarea asociada
L4 2026-10-03 user (verbatim): > mira como es la estructura ahora, dame la mejor referncia para minimizar el consumo de tokens y a la vez mantener la guia y calidad
L5 2026-10-03 user (verbatim): > me gsuta! vamos con esa
L6 2026-10-03 analysis: paraphrase rule at assets/orchestrator-delegation.md:60 (gentle-pi only); doc format at assets/orchestrator-memory.md:7 mirrored from gentle-ai routing.go; verify agent never sees requirements; no reproduce-first rule; bench B-luna handoffs 283/1786→1542→963/358/285 chars; existing docs median 6.6k, max 39.7k chars, dominated by logs.
L7 2026-10-03 forecast: ~250 authored changed lines across T1+T2 (under the ~400 budget); T3 lives in another repository.
L8 2026-10-03 user (verbatim): > orchestrator-memory.md es algo que recien se llama al hacer odd con archivo .md?
   finding: orchestrator-memory.md and orchestrator-delegation.md are lazy (only named in assets/orchestrator.md:44,66); the B-luna orchestrator never read either. T1 must put the compact doc format and handoff contract in the always-on ODD steps (extensions/gentle-ai.ts:1253-1262) and keep detail in the lazy assets.
L9 2026-10-03 T1 evidence (risk: medium, prompt-contract change; checks: writer self-verification inline, no delegation per L2):
   RED: tests/odd-routing-contract.test.ts new "feature document is the verbatim specification..." failed on missing `## Specs`; doc-format test failed on missing "verification evidence, progress, and next step".
   GREEN: 20 prompt-contract test files 589/589; `npm run typecheck` no regressions; `npm test` all stages passed.
   Decision: fixture line 19 (LB2 "Translate the user's request into concise English") moved to `replaced` in tests/orchestrator-budget.test.ts; its first sentence stays pinned by tests/persona-single-channel.test.ts.
   Always-on prompt grew by the compact contract in extensions/gentle-ai.ts steps 5-6 (orchestrator.md budget untouched).
L10 2026-10-03 T2 evidence (risk: HIGH, touches writer admission; independent verifier not run because the user forbade delegation (L2); RDD assess unavailable: `gentle_review` not exposed in this session):
   RED: rejection-detail test (writer-edit-surface-scope), missing `inheritAllowedEditSurfaces` export (bounded-writer-admission), "Recent task ids" assertion (gentle-agents) all failed first.
   GREEN: writer-edit-surface-scope 14/14, bounded-writer-admission 8/8, gentle-agents 190/190; `npm run typecheck` no regressions; `npm test` all stages passed.
   Decisions: inheritance only for generic writers (gentle-ai-worker, worker), never jd-fix-agent; only when the follow-up and its context carry no heading; inherited surfaces come from the original task prompt (surfaces passed only via `context` are not inherited and still reject). Rejection keeps the canonical text as prefix and appends the concrete problem plus "Resend the same task text unchanged...".
   Gap: continuation inheritance is unit-tested on the helper; the one-line wiring in subagent_continue has no end-to-end writer test.
