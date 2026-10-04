# Find related published work without waking its owner

## Goal
Turn flat session/task metadata into useful work discovery: repository scope,
area → topic, bounded tags, and explicit work references. User authorized
implementation and nondestructive delivery; no new main merge is authorized.

## Contract
- Extend existing explicit published state and derived projections, not a new registry.
- Preserve legacy activity and older published-state reads; invalid optional data must not hide peers.
- Classification is owner-declared public metadata, never extracted from private history.
- Same labels suggest possible overlap; explicit references explain declared links, not authority.
- Reuse repository/session/task identities; do not confuse child task IDs with peer session IDs.
- Search/filter locally over bounded published data; disclose unknowns and incomplete coverage.
- No model calls, owner wakes, Git probes during discovery, or implicit execution/dependency grants.
- No paid model runs, main pushes/merges, runtime reload, or installed-checkout source changes.

## Delivery
Sequential stacked feature-parent PRs, individually useful and ≤400 additions + deletions,
including tests/docs/tracker. Use nonclosing `Refs #1702` (approved coordination tracker).
Do not close owner-decision coverage or duplicate ODD-file indexing/automatic agent routing.

## Work units (forecast pending scoped exploration)
- [x] Publish bounded classification with compatible persistence and regression tests.
- [x] Annotate actual allocated owned child task IDs explicitly, without child-prompt inheritance.
- [ ] Expose/filter published classification through existing discovery, with match reasons.
- [ ] Cover real SDK publication/search and explicit helper capture boundaries.

## Evidence
- Baseline: `653dad90fe2072929e8fb722e0b95ce35e827f9e` (all prior coordination PRs merged).
- Dedicated root: `work-classification`, branch `feat/work-classification`.
- Dependencies: frozen local `pnpm install --frozen-lockfile --ignore-scripts` succeeded.
- Root `AGENTS.md` absent; inherited global preferences and repository skills apply.
- Duplicate-class search: 185 orchestrator / 59 classification matches, not saturated.
- Related but separate: #1160 ODD file index, #1025 launch routing, #1168 automatic routing.
- #1702: OPEN with `status:approved`; no issue/label mutation performed.
- Publication RED: valid `work` rejected by the original `decodeCuratedState`; 0/1 passed.
- Publication GREEN: 199 focused + 20 regression tests passed; type baseline 186, no regressions.
- Runtime check: eight modules match; orchestrator code remains loaded directly as TypeScript.
- Native assessment after staging: medium/large, 293 A+D, under budget; native outcome unknown.
- Publication independent verification: 219 passed; PR #1779, `bc7624a2`, 301 A+D, CI green.
- Annotation RED: missing status and invalid metadata reached preparation; two intended failures.
- Annotation GREEN: 231 affected tests passed, type baseline 186 unchanged, runtime eight unchanged.
- Independent inspection reproduced same-manager reentrant owner-cache replacement despite 230 passing tests.
- Guard fix RED: missing expected exception; GREEN pins captured owner and preserves new-owner notes.
- Fixed annotation slice: 223 A+D before tracker; fresh independent verification 231 passed, no drift.
- Helper capture intentionally still excludes `work`; publication is not search or inheritance.

## Remaining
Scoped design, meaningful RED → GREEN per runnable behavior, independent verification,
exact authored line counts, remote PR/check readbacks. Runtime activation is not part of delivery.
