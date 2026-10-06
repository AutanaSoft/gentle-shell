# Background jobs — native background command monitoring

Branch: `feat/background-jobs`. Related: gentle-shell#1171 (orchestrator invents `sleep` to wait).
References: Claude Code background Bash (`run_in_background`, `BashOutput`, `KillShell`, completion notice) and `@ksankar/pi-monitor` (wake once on exit / match / silence, no polling).

## Specs

- S1 — Problem, verbatim (L1): "quiero que agreguemos algo nativo a gentle shell para monitorizar ejecuciones en background, ahora mismo o gastamos un sub agente o el orquestador se queda esperando tontamente cno un sleep, ej: a que termine un ci."
- S2 — Shape, verbatim (L2, L3): "algo como esto https://pi.dev/packages/@ksankar/pi-monitor?name=background+monitor" and "como lo que tiene claude code".
- S3 — `bg_bash` starts a shell command in the background and returns a job id immediately; the model turn is not blocked and no tokens are spent while waiting.
- S4 — When the job exits on its own, the parent session is notified exactly once (exit code or signal, last output lines, log file path), through the same no-polling parent delivery used for background subagent completions (steer into a running turn, or store + wake when idle).
- S5 — Optional `match` (regex, optional `flags`) wakes the parent once on the first complete output line that matches; optional `silenceSeconds` wakes it once when the job produces no output for that long. Neither stops the job (it keeps running, as in Claude Code).
- S6 — `bg_output` returns output produced since the previous read of that job (optional regex filter on lines), plus job status.
- S7 — `bg_kill` stops the job's whole process tree; a killed job sends no exit notice. `bg_list` lists jobs with status.
- S8 — Jobs live in memory, are owned by the starting session, are capped (25 running), and are killed on session shutdown. Output goes to a temp log file.
- S9 — Human surface: `/jobs` command and a footer count of running jobs. Docs and orchestrator guidance tell the model to use `bg_bash` instead of `sleep` loops or a subagent to wait.

## Tasks

- T1 — S5, S6: pure core (line splitting, match, silence, incremental read cursor, tail) in `lib/background-jobs.ts`; inline; commit pending.
- T2 — S3, S7, S8: process runner (process group spawn, log file, tree kill, cap, shutdown cleanup); inline; commit pending.
- T3 — S3-S8: tools `bg_bash`/`bg_output`/`bg_kill`/`bg_list` wired into the gentle-agents parent delivery router; inline; commit pending.
- T4 — S9: `/jobs`, footer count, docs, orchestrator guidance; inline; commit pending.

## Log

- L1 (user): "quiero que agreguemos algo nativo a gentle shell para monitorizar ejecuciones en background, ahora mismo o gastamos un sub agente o el orquestador se queda esperando tontamente cno un sleep, ej: a que termine un ci."
- L2 (user, scope choice): "algo como esto https://pi.dev/packages/@ksankar/pi-monitor?name=background+monitor"
- L3 (user): "como lo que tiene claude code"
- L4 (decision, orchestrator): build natively (no third-party package) to reuse the gentle-agents parent delivery router. Claude Code semantics for lifetime (job keeps running after match/silence; exit always notifies unless killed); pi-monitor conditions (match, silence). `CheckLater` out of scope for v1.
