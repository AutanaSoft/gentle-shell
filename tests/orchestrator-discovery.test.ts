import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { PresencePublisher, listPresence } from "../lib/orchestrator-presence.ts";
import { ActiveSessionListener, SessionPresenceRegistry } from "../lib/agents-session-transport.ts";
import { discoverOrchestrators } from "../lib/orchestrator-discovery.ts";

function fixture(t: TestContext) {
	const profile = realpathSync(mkdtempSync(join(tmpdir(), "discovery-")));
	t.after(() => rmSync(profile, { recursive: true, force: true }));
	return profile;
}
const peer = { version: 1 as const, sessionId: "peer", endpoint: "/socket/activation", createdAt: 1 };
test("exact ac671593 validator accepts published headers after metadata update", async (t) => {
	const source = execFileSync("git", ["show", "ac671593:lib/orchestrator-presence.ts"], { encoding: "utf8" });
	const baseline = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source + "\nexport { validHeader };", { mode: "transform" })).toString("base64")}`);
	const profile = fixture(t);
	const publisher = PresencePublisher.start({ profile, sessionId: "peer", label: "Review", activity: [] });
	t.after(() => publisher.dispose());
	publisher.updateDiscovery(peer, { workspace: "/repo", tasks: [] });
	const name = `${publisher.target.sessionHash}.${publisher.target.incarnation}.header.json`;
	assert.equal(baseline.validHeader(JSON.parse(readFileSync(join(profile, "gentle-agents", "presence", name), "utf8"))), true);
	const sidecar = join(profile, "gentle-agents", "presence", name.replace("header.json", "discovery.json"));
	const value = JSON.parse(readFileSync(sidecar, "utf8"));
	for (const invalid of ["{broken", JSON.stringify({ ...value, generation: 999 }), JSON.stringify({ ...value, incarnation: "other" }), JSON.stringify({ ...value, metadata: {} })]) {
		writeFileSync(sidecar, invalid);
		assert.equal(listPresence(profile).entries.length, 1);
		assert.equal(discoverOrchestrators(profile, [peer])[0].freshness, "unknown");
	}
	rmSync(sidecar);
	assert.equal(listPresence(profile).entries.length, 1);
	assert.equal(discoverOrchestrators(profile, [peer])[0].freshness, "unknown");
});
test("joins activation-bound metadata without exporting prompts or thread output", (t) => {
	const profile = fixture(t);
	const publisher = PresencePublisher.start({ profile, sessionId: peer.sessionId, label: "Review auth", activity: [] });
	try {
		publisher.updateDiscovery(peer, { workspace: "/repo", tasks: [{ id: "t1", label: "Verify auth", status: "running", cwd: "/repo-child", prompt: "PRIVATE PROMPT", result: "PRIVATE OUTPUT" } as never] });
		const [candidate] = discoverOrchestrators(profile, [peer]);
		assert.equal(candidate.label, "Review auth");
		assert.equal(candidate.workspace, "/repo");
		assert.deepEqual(candidate.tasks, [{ id: "t1", label: "Verify auth", status: "running", workspace: "/repo-child" }]);
		assert.equal(candidate.reachability, "unknown");
		assert.doesNotMatch(JSON.stringify(candidate), /PRIVATE|endpoint|activation/);
		assert.equal(discoverOrchestrators(profile, [{ ...peer, endpoint: "/socket/replacement" }])[0].freshness, "unknown");
		assert.equal(discoverOrchestrators(profile, [peer], Date.now() + 20_000)[0].freshness, "stale");
		assert.equal(discoverOrchestrators(profile, [peer], 0)[0].freshness, "stale");
		assert.equal(discoverOrchestrators(profile, [peer, { ...peer, endpoint: "/socket/duplicate" }])[0].freshness, "unknown");
		publisher.updateDiscovery(peer, { workspace: "/" + "x".repeat(121), tasks: Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: "\u001b[31mCheck\n auth", status: "queued", cwd: "/repo\nother" })) });
		const bounded = discoverOrchestrators(profile, [peer])[0];
		assert.equal(bounded.workspace, "");
		assert.equal(bounded.tasks?.length, 8);
		assert.equal(bounded.omitted, 2);
		assert.equal(bounded.tasks?.[0].label, "Check auth");
		assert.equal(bounded.tasks?.[0].workspace, "");
		assert.throws(() => publisher.updateDiscovery({ ...peer, sessionId: "other" }, { workspace: "/repo", tasks: [] }), /malformed/);
	} finally { publisher.dispose(); }
});

test("missing and ambiguous metadata never hide routing IDs", (t) => {
	const profile = fixture(t);
	assert.deepEqual(discoverOrchestrators(profile, [peer]), [{ sessionId: "peer", reachability: "unknown", freshness: "unknown" }]);
	const publishers = [1, 2].map(() => PresencePublisher.start({ profile, sessionId: "peer", label: "Same name", activity: [] }));
	try {
		for (const publisher of publishers) publisher.updateDiscovery(peer, { workspace: "/repo", tasks: [] });
		assert.equal(discoverOrchestrators(profile, [peer])[0].freshness, "unknown");
		assert.throws(() => publishers[0].updateDiscovery(peer, { workspace: "/repo", tasks: [{ id: "x", label: "x", status: "invented", cwd: "/repo" }] }), /malformed/);
	} finally { publishers.forEach(publisher => publisher.dispose()); }
	writeFileSync(join(profile, "gentle-agents", "presence", "invalid.header.json"), "{not-json");
	assert.equal(discoverOrchestrators(profile, [peer])[0].freshness, "unknown");
});

test("real POSIX registry selects one routing activation; another activation's metadata cannot join", { skip: process.platform === "win32" }, async (t) => {
	const profile = fixture(t);
	const publisher = PresencePublisher.start({ profile, sessionId: "peer", label: "Selected peer", activity: [] });
	t.after(() => publisher.dispose());
	const registry = await SessionPresenceRegistry.create(profile);
	const listeners = [1, 2].map(() => new ActiveSessionListener(registry, "peer", async () => {}));
	t.after(async () => { await Promise.all(listeners.map(listener => listener.close())); });
	for (const listener of listeners) await listener.start();
	const selected = await registry.listActivations();
	assert.equal(selected.length, 1);
	assert.deepEqual(selected[0], await registry.resolve("peer"));
	const other = listeners.map(listener => listener.record!).find(record => record.endpoint !== selected[0].endpoint)!;
	publisher.updateDiscovery(other, { workspace: "/wrong", tasks: [] });
	assert.equal(discoverOrchestrators(profile, selected)[0].freshness, "unknown");
	publisher.updateDiscovery(selected[0], { workspace: "/selected", tasks: [] });
	assert.equal(discoverOrchestrators(profile, selected)[0].workspace, "/selected");
	assert.equal(discoverOrchestrators(profile, selected)[0].reachability, "unknown");
});

test("duplicate display names do not become routing identities", (t) => {
	const profile = fixture(t);
	const peers = [peer, { ...peer, sessionId: "other", endpoint: "/socket/other" }];
	const publishers = peers.map(p => PresencePublisher.start({ profile, sessionId: p.sessionId, label: "Same name", activity: [] }));
	try {
		publishers.forEach((publisher, i) => publisher.updateDiscovery(peers[i], { workspace: `/repo${i}`, tasks: [] }));
		const candidates = discoverOrchestrators(profile, peers);
		assert.deepEqual(candidates.map(c => c.label), ["Same name", "Same name"]);
		assert.deepEqual(candidates.map(c => c.sessionId), ["peer", "other"]);
		assert.deepEqual(candidates.map(c => c.workspace), ["/repo0", "/repo1"]);
	} finally { publishers.forEach(publisher => publisher.dispose()); }
});
