# Recognized data-loss safety

Recognized destructive database and broad filesystem commands require **fresh primary confirmation** and are **blocked in package-owned children**. These safeguards apply independently of the existing autonomous-mode configuration. The proposed `/yolo` mode command is future work and is **not yet present**.

## Current boundary

| Recognized executable form | Primary session | Delegated child |
|---|---|---|
| SQL `DROP TABLE/DATABASE/SCHEMA/INDEX/VIEW`, `TRUNCATE [TABLE]` | Fresh confirmation | Block |
| SQL `DELETE FROM` without `WHERE`, or a trailing literal `WHERE 1=1` / `WHERE TRUE` | Fresh confirmation | Block |
| Recursive `rm` (`-r`, `-R`, combined short flags, `--recursive`), `find -delete`, recognized destructive `find -exec/-execdir` and `xargs` invocations | Fresh confirmation | Block |
| Recursive `rm` targeting `/`, `/*`, `.`, `..`, home or home descendants | Hard block | Block |
| Git force push, hard reset, forced clean | Hard block | Block |
| Git forced branch deletion, reset/clean/restore/rebase, checkout with `--` or force, stash drop/clear | Existing primary policy remains | Block |

SQL recognition is limited to literal arguments passed to `psql`, `mysql`, `mariadb`, or `sqlite3`, literal `echo`/`printf` pipelines into those clients, and simple named heredocs. SQL string literals and comments are excluded from the new SQL recognition; printing or searching destructive prose alone does not trigger it.

Command recognition follows simple shell separators, pipelines and parenthesized command groups. It handles executable paths, leading assignments, common `env`, `sudo`, `command`, `exec`, `nohup`, `timeout` and `xargs` wrappers, and literal `sh/bash/zsh/dash -c` payloads (up to five recognition levels). Every recognized operation in a compound command participates; an earlier allowed delivery action cannot hide later data loss.

Ordinary builds, tests, read-only SQL, predicate-bounded literal deletes, Git status/log and plain pushes are unchanged by the new classifier. A build command that explicitly includes recursive deletion is still guarded.

## Approval and precedence

1. Existing hard denies and newly recognized hard-deny forms win across the command.
2. Explicit configured blocks retain their existing semantics and win before data-loss confirmation.
3. Recognized database/filesystem data loss always requires fresh confirmation, even when autonomous mode or a matched delivery action is configured to allow.
4. No UI, cancellation, a non-true answer or a dialog error cannot authorize execution. Approval is not cached; permission and Herdr blocker lifecycle events remain balanced.

Children receive the lightweight `child-safety.ts` entry alongside `child-context.ts`; they do not need the full primary extension. The safety entry registers nothing outside `GENTLE_PI_AGENTS_CHILD=1`, preventing duplicate primary prompts during package auto-discovery. If the full primary extension is explicitly loaded in a child, its destructive-command path also blocks instead of prompting.

## Limitations: defense in depth, not a sandbox

- This is deterministic lexical recognition, **not** shell or SQL evaluation. Aliases, functions, dynamically assembled commands, variable/command expansion inside quoted payloads, unusual wrapper flags, complex heredocs and deeply nested wrappers can evade recognition. Simple recursive removal of a variable target is guarded, but its expanded target cannot reliably be identified as a hard-deny path.
- Scripts, migration files, redirected SQL files, arbitrary interpreter programs (Python/Node/etc.), encoded payloads and remote execution are not inspected. Non-recursive wildcard deletion, file truncation, other database clients and nontrivial tautological SQL predicates are not comprehensively classified. A `WHERE` clause is not proof of bounded impact.
- Only `bash` tool calls reach this new boundary, including nested calls dispatched through Pi's tool-event pipeline. Direct process execution, user shell commands, MCP tools and other tools are not covered by these hooks.
- The older primary regex safeguards remain authoritative and may be more conservative about text than the shared recognizer. Missing or explicitly overridden child extension paths remove the lightweight boundary; a valid package installation must include the safety entry.

Keep task authorization, explicit user restrictions, sensitive-path protection and safer execution plans in force. This guard does not grant delivery or remote-operation authority, activate YOLO, change RDD, or auto-answer any modal.
