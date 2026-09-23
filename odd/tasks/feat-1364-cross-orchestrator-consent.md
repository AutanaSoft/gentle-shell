# User consent for cross-orchestrator communication (#1364)

- Feature: `feat-1364-cross-orchestrator-consent`
- Branch: `feat/1364-cross-orchestrator-consent` (base `upstream/main` ef55af79)
- Engram mirror: `odd/feat-1364-cross-orchestrator-consent/tasks` (offline/unavailable)
- TDD: strict; runner `node --experimental-strip-types --test tests/session-messaging-grants.test.ts tests/gentle-agents.test.ts`
- Delivery: `single-pr`; work-unit commits per task
- RDD: off (global)

## Objective

Require explicit interactive human authorization before any outbound orchestrator-to-orchestrator message or equivalent communication via `orchestrator_send_message`, preventing unauthorized context disclosure and unsolicited session interruptions.

## Problem

Currently, `orchestrator_send_message` can send notifications directly to other advertised sessions without explicit user consent. When a recipient is known or chosen via UI picker, the message payload is dispatched immediately. Cross-orchestrator messaging can leak sensitive repository/task context or interrupt another user's session without the initiating user's knowledge or consent.

## Scope

In:
- `lib/session-messaging-grants.ts`: Ephemeral, in-memory grant manager `SessionMessagingGrants` bound to the active `sessionManager` and initiating `sessionId`. Supports 3 decisions:
  1. `Allow once`: authorizes only the current outbound message to the target recipient; does not retain permission for future messages.
  2. `Allow for this session`: authorizes communication with the target recipient for the lifetime of the initiating session.
  3. `Deny`: fails closed without sending; returns an authorization refusal.
- Interactive prompt: Prompts with recipient ID, message preview, and reason via `ctx.ui.select` when interactive UI is available.
- Fail closed: If `!ctx.hasUI || !ctx.ui?.select`, if aborted, or if session identity changes during the prompt, fail closed without sending.
- `extensions/gentle-agents.ts`: Integrate `SessionMessagingGrants` into `orchestrator_send_message` tool execution before calling `transport.client.sendNotification`. Add optional `reason` parameter to tool schema.
- `tests/session-messaging-grants.test.ts` and `tests/gentle-agents.test.ts`: Test all 3 decisions, subsequent messages, changed recipients, headless fail-closed, abort cancellation, and session expiry.

Out:
- Changes to underlying transport client, listener, or registry.
- Changes to inbound message delivery or notification handling.

## Tasks and routes
- [x] T1 (strict TDD tests) — Author failing regression tests for `SessionMessagingGrants` and `orchestrator_send_message` consent interception.
- [x] T2 (implementation) — Implement `SessionMessagingGrants` in `lib/session-messaging-grants.ts` and integrate it into `extensions/gentle-agents.ts`.
- [x] T3 (verification) — Run targeted tests, gentle-agents test suite, and typecheck to verify zero regressions.

## Progress
- 2026-09-23: Created `tests/session-messaging-grants.test.ts` testing `Allow once`, `Allow for this session`, `Deny`, headless fail-closed, abort cancellation, and session expiry / manager replacement.
- 2026-09-23: Implemented `SessionMessagingGrants` in `lib/session-messaging-grants.ts` and wired it into `extensions/gentle-agents.ts` for `orchestrator_send_message`. Added optional `reason` parameter to tool schema. Updated `tests/gentle-agents.test.ts` and `docs/gentle-shell.md`.
- 2026-09-23: Verified suites: `tests/session-messaging-grants.test.ts` (8/8 passed), `tests/gentle-agents.test.ts` (127/127 passed), `npm run typecheck` (0 regressions), and `npm run check:provider-contract` (passed).

## Verification
- `node --experimental-strip-types --test tests/session-messaging-grants.test.ts`
- `node --experimental-strip-types --test tests/gentle-agents.test.ts`
- `npm run typecheck`
