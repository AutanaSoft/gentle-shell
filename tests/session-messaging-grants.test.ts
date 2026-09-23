import assert from "node:assert/strict";
import test from "node:test";
import {
	SessionMessagingGrants,
	MESSAGING_CONSENT_DECISIONS,
} from "../lib/session-messaging-grants.ts";

function context(
	selectResult?: (title: string, options: string[]) => Promise<string | undefined>,
	hasUI = true
) {
	let id = "session-1";
	let calls = 0;
	const dialogs: { title: string; options: string[] }[] = [];
	const sessionManager = { getSessionId: () => id };
	const ctx = {
		sessionManager,
		hasUI,
		ui: hasUI && selectResult
			? {
					select: async (title: string, options: string[]) => {
						calls++;
						dialogs.push({ title, options });
						return selectResult(title, options);
					},
				}
			: undefined,
	};
	return {
		ctx,
		setId: (next: string) => {
			id = next;
		},
		calls: () => calls,
		dialogs: () => dialogs,
	};
}

test("SessionMessagingGrants - Allow once authorizes only the current message and prompts again on next send", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => MESSAGING_CONSENT_DECISIONS.ALLOW_ONCE);

	await grants.authorize(h.ctx as never, "peer-alpha", {
		message: "hello peer",
		reason: "sync state",
	});
	assert.equal(h.calls(), 1);
	assert.match(h.dialogs()[0].title, /peer-alpha/);
	assert.match(h.dialogs()[0].title, /sync state/);
	assert.match(h.dialogs()[0].title, /hello peer/);
	assert.deepEqual(h.dialogs()[0].options, [
		MESSAGING_CONSENT_DECISIONS.ALLOW_ONCE,
		MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION,
		MESSAGING_CONSENT_DECISIONS.DENY,
	]);

	// Second send to same peer must prompt again because it was only allowed once
	await grants.authorize(h.ctx as never, "peer-alpha", {
		message: "second message",
	});
	assert.equal(h.calls(), 2);
});

test("SessionMessagingGrants - Allow for this session caches permission and skips prompt on subsequent sends to same recipient", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION);

	await grants.authorize(h.ctx as never, "peer-alpha", {
		message: "first message",
	});
	assert.equal(h.calls(), 1);

	// Subsequent sends to peer-alpha in the same session must NOT prompt
	await grants.authorize(h.ctx as never, "peer-alpha", {
		message: "second message",
	});
	assert.equal(h.calls(), 1, "must not prompt again for the same session-granted recipient");

	// But a different recipient must prompt!
	await grants.authorize(h.ctx as never, "peer-beta", {
		message: "hello beta",
	});
	assert.equal(h.calls(), 2, "changed recipient must require a new decision");
});

test("SessionMessagingGrants - Deny fails closed and sends nothing", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => MESSAGING_CONSENT_DECISIONS.DENY);

	await assert.rejects(
		grants.authorize(h.ctx as never, "peer-alpha", { message: "hello" }),
		/denied/i
	);
	assert.equal(h.calls(), 1);
});

test("SessionMessagingGrants - cancelling prompt (Escape / undefined) fails closed", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => undefined);

	await assert.rejects(
		grants.authorize(h.ctx as never, "peer-alpha", { message: "hello" }),
		/denied|cancelled/i
	);
	assert.equal(h.calls(), 1);
});

test("SessionMessagingGrants - headless or missing UI fails closed without prompting", async () => {
	const grants = new SessionMessagingGrants();
	const headless = context(undefined, false);

	await assert.rejects(
		grants.authorize(headless.ctx as never, "peer-alpha", { message: "hello" }),
		/interactive.*consent/i
	);
	assert.equal(headless.calls(), 0);
});

test("SessionMessagingGrants - AbortSignal aborts consent and fails closed", async () => {
	const grants = new SessionMessagingGrants();
	const ac = new AbortController();
	ac.abort();

	const h = context(async () => MESSAGING_CONSENT_DECISIONS.ALLOW_ONCE);
	await assert.rejects(
		grants.authorize(h.ctx as never, "peer-alpha", {
			message: "hello",
			signal: ac.signal,
		}),
		/aborted/i
	);
	assert.equal(h.calls(), 0);
});

test("SessionMessagingGrants - session change invalidates previous session grants", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION);

	await grants.authorize(h.ctx as never, "peer-alpha", { message: "first" });
	assert.equal(h.calls(), 1);

	// Change session ID
	h.setId("session-2");

	// Now peer-alpha must prompt again because session changed
	await grants.authorize(h.ctx as never, "peer-alpha", { message: "in new session" });
	assert.equal(h.calls(), 2, "session change must invalidate previous session grants");
});

test("SessionMessagingGrants - sessionManager replacement revokes grants", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION);

	await grants.authorize(h.ctx as never, "peer-alpha", { message: "first" });
	assert.equal(h.calls(), 1);

	// Replace sessionManager object
	const replacedCtx = {
		...h.ctx,
		sessionManager: { getSessionId: () => "session-1" },
	};

	await grants.authorize(replacedCtx as never, "peer-alpha", { message: "with new manager" });
	assert.equal(h.calls(), 2, "sessionManager replacement must invalidate previous grants");
});

test("SessionMessagingGrants - session ID change during prompt selection rejects and records no grant", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => {
		h.setId("session-mutated");
		return MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION;
	});

	await assert.rejects(
		grants.authorize(h.ctx as never, "peer-alpha", { message: "concurrent" }),
		/identity changed/i
	);
	assert.equal(h.calls(), 1);

	// Subsequent authorization in the mutated session must prompt again
	await grants.authorize(h.ctx as never, "peer-alpha", { message: "fresh" });
	assert.equal(h.calls(), 2, "must prompt again because no grant was recorded for mutated session");
});

test("SessionMessagingGrants - truncates long messages with char count notice and derives default reason", async () => {
	const grants = new SessionMessagingGrants();
	const h = context(async () => MESSAGING_CONSENT_DECISIONS.ALLOW_ONCE);
	const longMessage = "x".repeat(300);

	await grants.authorize(h.ctx as never, "peer-long", { message: longMessage });
	assert.equal(h.calls(), 1);
	assert.match(h.dialogs()[0].title, /Reason: Notification from session session-1/);
	assert.match(h.dialogs()[0].title, /Message \(300 chars, preview\): x{197}\.\.\./);
});
