# Agent coordination: activation-safe discovery

Approved issues: #1701 and #1702. Delivery strategy: stacked PRs.
This first unit **Refs #1701**; neither issue is closed by metadata discovery.
Baseline supplied by parent: `ac671593`; branch: `feat/1701-coordination-discovery`.
Commits, push, PR creation, and memory mirror remain parent-owned; no merge approval exists.

## Unit 1: recognizable advertised peers

- Preserve exact schema-1 headers. Optional private, bounded derived sidecars bind metadata to session/incarnation/generation and transport activation; they are not an identity/authority registry.
- Preserve routing IDs, unknown reachability, heartbeat freshness, and unknown context on ambiguous/missing/stale metadata.
- Publish recorded labels/workspaces and eight unfinished runtime-owned child labels/statuses/launch workspaces; omit restored running history, prompts, threads, and output.
- No new public tool, model call, or message. Paths never establish isolation or locks.
- Review boundary: presence projection/sidecar, discovery join, extension wiring, focused tests, and activity documentation. Commit pending parent review.

## Blocker dispositions and observed verification

- P1 RED: `node --experimental-strip-types --test tests/orchestrator-discovery.test.ts` failed because the exact `ac671593` validator rejected a new metadata-bearing header (`false !== true`). GREEN: same validator accepts unchanged headers with sidecars; malformed/missing/wrong-incarnation/wrong-generation sidecars leave valid headers visible and metadata unknown.
- Restoration P2 RED: `node --experimental-strip-types --test --test-name-pattern='restored task history' tests/gentle-agents.test.ts` captured `history-running` in publication during the synchronous restore summary callback. GREEN: same command passed after runtime-owned gating. Admission refresh publishes real admitted tasks without requiring a later child event; alternate extension harness passed.
- Duplicate-activation P2: the real POSIX registry selects one canonical newest advertised activation (existing token tie-break). New real-registry test confirms selection equals `resolve`, metadata for the other activation stays unknown, and exact selected metadata joins with reachability unknown. No candidate-caused failure was reproduced for canonical selection; mock duplicate arrays are not claimed to detect real registry ambiguity. Transport/message targeting is unchanged.
- Final: `node --experimental-strip-types --test tests/orchestrator-presence.test.ts tests/gentle-agents.test.ts tests/orchestrator-discovery.test.ts tests/agents-session-transport.test.ts`: 237 passed, 0 failed. Fixture Git probes emitted non-repository warnings.
- Runtime boundary: registered `orchestrator_list` extension harness joined a known peer label/workspace/child task and observed zero child launches and zero messages. Harness evidence, not an interactive live-model session.
- `node scripts/check-types.mjs`: 186 recorded diagnostics, no regressions (12 file/code pairs improved).
- `node scripts/build-runtime-modules.mjs --check`: 8 generated modules match; one-shot metrics sources validated.
- Discovery fixture teardown removes only each test-owned root; publishers/listeners clean their own resources.
- Environment incident correction: the previous package-command invocation emitted installation/postinstall output, but its provenance is unknown. Inspection confirms `check-types.mjs` contains no install code. Parent reports replacing the owned dependency symlink with local dependencies installed using frozen lockfile/ignore-scripts. This correction pass used direct Node commands only.

## Next stacked units / remaining acceptance

#1701: explicit subject/task-summary declarations and extended scope lifecycle; authoritative repository/worktree context; rename refresh; completed child policy; scalable bounded continuation. First-page overflow conservatively leaves context unknown; older publishers remain visible but have unknown discovery metadata.
#1702 remains separate: metadata alone cannot answer arbitrary cross-session reasoning questions.

Rollback boundary: remove this unit's optional sidecar/projection/join and restore raw-ID-only `orchestrator_list`, together with its tests/docs; do not touch transport messaging, existing activity threads, dependency artifacts, or unrelated work.
