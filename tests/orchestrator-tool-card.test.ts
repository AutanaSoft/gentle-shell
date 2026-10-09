import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { orchestratorToolRenderers } from "../lib/orchestrator-tool-card.ts";
import { CARD_STYLE, cardStyle, setCardStyle } from "../lib/shell-card.ts";
import { stripAnsi } from "../lib/terminal-theme.ts";

const theme = { fg: (_role: string, text: string) => text, bg: (_role: string, text: string) => text };
interface Example {
	kind: Parameters<typeof orchestratorToolRenderers>[0];
	args: Record<string, unknown>;
	result: { content: Array<{ type: string; text: string }>; details?: unknown };
	summary: RegExp;
}
const cases: Example[] = [
	{ kind: "session" as const, args: { subject: "Inspect Windows", state: { objective: "Read-only VM inspection" } }, result: { content: [{ type: "text", text: "Active session ID: stable-routing-id\nCurrent alias: Recover Alan changes" }], details: { gentleAgents: { senderSessionId: "stable-routing-id", alias: "Recover Alan changes" } } }, summary: /Current alias: Recover Alan changes/ },
	{ kind: "consult" as const, args: { recipient_session_id: "peer-id" }, result: { content: [{ type: "text", text: '{"status":"available","authority":"none"}' }], details: { gentleAgents: { receipt: { status: "available", authority: "none" } } } }, summary: /available.*not an owner reply/i },
	{ kind: "list" as const, args: {}, result: { content: [{ type: "text", text: "Advertised sessions (reachability is unknown):\n- peer-id" }], details: { gentleAgents: { candidates: [{ sessionId: "peer-id" }] } } }, summary: /1 advertised session.*reachability unknown/i },
];

function card(entry: Example, expanded: boolean, partial = false) {
	const renderer = orchestratorToolRenderers(entry.kind, (open) => open ? "collapse" : "expand");
	const context = { args: entry.args, state: {}, expanded, isPartial: partial };
	const call = renderer.renderCall(entry.args, theme, context);
	const result = renderer.renderResult(entry.result, { expanded, isPartial: partial }, theme, context);
	return { render: (width: number) => [...call.render(width), ...result.render(width)], invalidate() { call.invalidate(); result.invalidate(); } };
}

test("orchestrator cards replace JSON calls with semantic headings and useful summaries", () => {
	for (const entry of cases) {
		const compact = stripAnsi(card(entry, false).render(140).join("\n"));
		assert.match(compact, entry.summary);
		assert.doesNotMatch(compact, /\{"|stable-routing-id|peer-id|Read-only VM inspection/);
		assert.match(compact, /expand/);
		const expanded = stripAnsi(card(entry, true).render(140).join("\n"));
		assert.notEqual(compact, expanded);
		assert.doesNotMatch(expanded, /Arguments:|Result details:|\{"|^\s*[{}]\s*$/m);
		assert.ok(expanded.includes(entry.kind === "session" ? "Routing ID:" : entry.kind === "consult" ? "Status:" : "Session ID:"));
		assert.match(expanded, /collapse/);
	}
	const identity = stripAnsi(card(cases[0], true).render(140).join("\n"));
	assert.match(identity, /Requested subject: Inspect Windows/);
	assert.match(identity, /Existing alias preserved/);
	assert.match(identity, /stable-routing-id/);
	assert.match(identity, /Read-only VM inspection/);
});

test("expanded discovery groups useful session context without JSON, duplicated output or unknown clutter", () => {
	const entry: Example = {
		...cases[2],
		result: {
			content: [{ type: "text", text: "Advertised sessions: raw-output-must-not-repeat" }],
			details: { gentleAgents: { candidates: [
				{ sessionId: "known-id", label: "API team", freshness: "recent", reachability: "unknown", workspace: "/work/api", tasks: [{ id: "task-1", label: "Check login", status: "running", workspace: "/work/task" }], scope: { host: { root: "/repo/api" }, complete: false, omittedTasks: 2 } },
				{ sessionId: "unknown-id", freshness: "unknown", reachability: "unknown" },
				{ sessionId: "stale-id", freshness: "stale", reachability: "unknown", label: "Old alias must stay hidden", workspace: "/stale-workspace" },
			] } },
		},
	};
	const before = structuredClone(entry);
	const output = stripAnsi(card(entry, true).render(140).join("\n"));
	assert.match(output, /1\. API team/);
	assert.match(output, /Session ID: known-id/);
	assert.match(output, /Workspace: \/work\/api/);
	assert.match(output, /Tasks:/);
	assert.match(output, /Check login/);
	assert.match(output, /Complete: no/);
	assert.match(output, /Omitted tasks: 2/);
	assert.match(output, /Metadata unavailable for 2 sessions/);
	assert.match(output, /Session ID: unknown-id/);
	assert.match(output, /Session ID: stale-id/);
	assert.doesNotMatch(output, /Arguments:|raw-output-must-not-repeat|context: unknown|repository: unknown|recorded catalog: unknown|Old alias|stale-workspace|[{}]/);
	assert.deepEqual(entry, before);
});

test("consultation, classified work, and missing-detail JSON become labelled rows with safety limits", () => {
	const examples: Example[] = [
		{ ...cases[1], result: { content: [{ type: "text", text: '{"status":"available","authority":"none"}' }], details: { gentleAgents: { receipt: { status: "available", ownerReply: false, authority: "none", snapshot: { label: "API team", state: { state: { objective: "Verify login" } } }, unknowns: ["reachability"], omissions: ["private-context"], digest: "technical-digest" } } } } },
		{ ...cases[2], args: { filter: { area: "Auth" } }, result: { content: [{ type: "text", text: '{"matches":[]}' }], details: { gentleAgents: { workSearch: { matches: [{ sessionId: "peer-id", work: { area: "Auth", tags: ["Review"] } }], coverage: { exhaustive: false, omittedMatches: 2 }, ownerReply: false, authority: "none" } } } } },
		{ ...cases[1], result: { content: [{ type: "text", text: '{"status":"unavailable","code":"not-ready"}' }] } },
	];
	const outputs = examples.map(entry => stripAnsi(card(entry, true).render(140).join("\n")));
	for (const output of outputs) assert.doesNotMatch(output, /[{}]|"status"|"matches"|Arguments:|Result details:/);
	assert.match(outputs[0], /Objective: Verify login/);
	assert.match(outputs[0], /Owner reply: no/);
	assert.match(outputs[0], /Authority: none/);
	assert.match(outputs[0], /Unknowns:/);
	assert.match(outputs[0], /private-context/);
	assert.doesNotMatch(outputs[0], /technical-digest/);
	assert.match(outputs[1], /Area: Auth/);
	assert.match(outputs[1], /Exhaustive: no/);
	assert.match(outputs[1], /Omitted matches: 2/);
	assert.match(outputs[2], /Code: not-ready/);
});

test("recent peers retain concise unknown repository scope and identity limits", () => {
	const entry: Example = { ...cases[2], result: { content: [], details: { gentleAgents: { candidates: [
		{ sessionId: "no-scope", label: "Workspace only", freshness: "recent", workspace: "/work" },
		{ sessionId: "no-identity", label: "Non-Git workspace", freshness: "recent", scope: { host: { root: null, cloneHash: null, resolvedAt: 1, source: "recorded-workspace/git" }, complete: true } },
	] } } } };
	const output = stripAnsi(card(entry, true).render(140).join("\n"));
	assert.match(output, /Repository scope: unknown/);
	assert.match(output, /Repository identity: unknown/);
	assert.doesNotMatch(output, /Root: null|Clone hash: null|[{}]/);
});

test("legacy JSON keys that match object prototypes render as data, never as label functions", () => {
	const entry: Example = { ...cases[1], result: { content: [{ type: "text", text: '{"status":"unavailable","constructor":"Visible constructor","__proto__":{"prototype":"Visible prototype"}}' }] } };
	const output = stripAnsi(card(entry, true).render(140).join("\n"));
	assert.match(output, /Constructor: Visible constructor/);
	assert.match(output, /Prototype: Visible prototype/);
	assert.doesNotMatch(output, /[{}]/);
});

test("nested readable data remains sanitized and width-safe with Unicode", () => {
	const unsafe = "\x1b]52;c;clipboard\x07\x1b[31mAPI 团队 e\u0301\x1b[0m\r\u0000";
	const entry: Example = { ...cases[1], result: { content: [{ type: "text", text: "ignored serialization" }], details: { gentleAgents: { receipt: { status: "available", snapshot: { [unsafe]: unsafe }, unknowns: [unsafe] } } } } };
	const previous = cardStyle();
	try {
		for (const style of Object.values(CARD_STYLE)) {
			setCardStyle(style);
			const view = card(entry, true);
			for (const width of [140, 60, 24, 8, 1, 0, 140]) {
				view.invalidate();
				const rows = view.render(width);
				for (const row of rows) assert.ok(visibleWidth(row) <= width);
				const output = stripAnsi(rows.join("\n"));
				assert.doesNotMatch(output, /clipboard|\x1b|\r|\u0000/);
				if (width === 140) assert.match(output, /API 团队 e\u0301/);
			}
		}
	} finally { setCardStyle(previous); }
});

test("pending requests and withdrawn state are readable without empty argument blocks", () => {
	for (const args of [{}, { subject: "Inspect Windows", state: null }]) {
		const renderer = orchestratorToolRenderers("session", () => "collapse");
		const output = stripAnsi(renderer.renderCall(args, theme, { args, state: {}, expanded: true, isPartial: true }).render(140).join("\n"));
		assert.doesNotMatch(output, /Arguments:|[{}]/);
		if ("state" in args) assert.match(output, /State: withdrawn/);
	}
});

test("the same completed row expands and collapses without stale detail or headings", () => {
	for (const entry of cases) {
		const renderer = orchestratorToolRenderers(entry.kind, open => open ? "collapse" : "expand");
		const context = { args: entry.args, state: {}, expanded: false, isPartial: false };
		const snapshots: string[] = [];
		for (const expanded of [false, true, false]) {
			context.expanded = expanded;
			const call = renderer.renderCall(entry.args, theme, context);
			const result = renderer.renderResult(entry.result, { expanded, isPartial: false }, theme, context);
			call.invalidate(); result.invalidate();
			snapshots.push(stripAnsi([...call.render(140), ...result.render(140)].join("\n")));
		}
		assert.equal(snapshots[0], snapshots[2]);
		assert.notEqual(snapshots[0], snapshots[1]);
		assert.doesNotMatch(snapshots[2], /Arguments:|Result details:/);
	}
});

test("identity without a requested subject or with a matching alias does not claim a preserved mismatch", () => {
	for (const args of [{}, { subject: "Recover Alan changes" }, { state: null }]) {
		const output = stripAnsi(card({ ...cases[0], args }, true).render(140).join("\n"));
		assert.doesNotMatch(output, /Existing alias preserved/);
	}
});

test("error and partial cards do not claim successful consultation or discovery", () => {
	for (const entry of cases) {
		const renderer = orchestratorToolRenderers(entry.kind, () => "expand");
		const context = { args: entry.args, state: {}, isPartial: true, expanded: false };
		const call = renderer.renderCall(entry.args, theme, context);
		assert.match(stripAnsi(call.render(120).join("\n")), /running/);
		const result = renderer.renderResult({ content: [{ type: "text", text: "Error: not ready" }], details: { error: "not ready" } }, { expanded: false, isPartial: false }, theme, context);
		const failed = stripAnsi([...call.render(120), ...result.render(120)].join("\n"));
		assert.match(failed, /Error: not ready/);
		assert.doesNotMatch(failed, /running|Current alias:|advertised sessions|available ·/);
	}
});

test("successful-looking partial results never display a final status or count", () => {
	for (const entry of cases.slice(1)) {
		const output = stripAnsi(card(entry, false, true).render(140).join("\n"));
		assert.match(output, /Receiving partial result/);
		assert.doesNotMatch(output, entry.summary);
	}
});

test("work search and detail-less stored results remain useful", () => {
	const renderer = orchestratorToolRenderers("list", () => "expand");
	const context = { args: { filter: {} }, state: {}, expanded: false, isPartial: false };
	const result = renderer.renderResult({ content: [{ type: "text", text: '{"matches":[]}' }], details: { gentleAgents: { workSearch: { matches: [] } } } }, { expanded: false, isPartial: false }, theme, context);
	assert.match(stripAnsi(result.render(140).join("\n")), /0 work matches.*non-exhaustive/i);
	const legacy = renderer.renderResult({ content: [{ type: "text", text: "No other sessions are currently advertised." }] }, { expanded: true, isPartial: false }, theme, context);
	assert.match(stripAnsi(legacy.render(140).join("\n")), /No other sessions/);
});

test("expanded cards preserve payloads, sanitize terminal text, and resize in both styles", () => {
	const previous = cardStyle();
	try {
		for (const style of Object.values(CARD_STYLE)) {
			setCardStyle(style);
			for (const entry of cases) for (const expanded of [false, true]) {
				const view = card(entry, expanded);
				for (const width of [140, 80, 24, 8, 2, 1, 0, 140]) {
					view.invalidate();
					const rows = view.render(width);
					for (const row of rows) assert.ok(visibleWidth(row) <= width);
					if (!width) assert.deepEqual(rows, []);
				}
			}
		}
		const unsafe = "\x1b]52;c;clipboard\x07Visible\r\u0000";
		const view = card({ ...cases[0], result: { content: [{ type: "text", text: unsafe }], details: { gentleAgents: { alias: unsafe, senderSessionId: "stable-routing-id" } } } }, true);
		const text = stripAnsi(view.render(140).join("\n"));
		assert.match(text, /Visible/);
		assert.doesNotMatch(text, /\x1b|\r|\u0000/);
	} finally { setCardStyle(previous); }
});
