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
		assert.match(expanded, /Arguments:|Result:/);
		for (const part of entry.result.content) for (const line of part.text.split("\n")) assert.ok(expanded.includes(line));
		assert.match(expanded, /collapse/);
	}
	const identity = stripAnsi(card(cases[0], true).render(140).join("\n"));
	assert.match(identity, /Requested subject: Inspect Windows/);
	assert.match(identity, /Existing alias preserved/);
	assert.match(identity, /stable-routing-id/);
	assert.match(identity, /Read-only VM inspection/);
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
