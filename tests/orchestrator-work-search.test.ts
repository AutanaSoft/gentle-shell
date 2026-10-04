import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { PresencePublisher } from "../lib/orchestrator-presence.ts";
import { discoverOrchestrators } from "../lib/orchestrator-discovery.ts";
import { OrchestratorStateCache } from "../lib/orchestrator-state.ts";
import { OrchestratorScopeCache } from "../lib/orchestrator-scope.ts";
import { searchPublishedWork, validateWorkFilter } from "../lib/orchestrator-work-search.ts";

function fixture(t: TestContext) {
	const profile = realpathSync(mkdtempSync(join(tmpdir(), "work-search-")));
	t.after(() => rmSync(profile, { recursive: true, force: true }));
	const peer = { version: 1 as const, sessionId: "peer", endpoint: "/activation", createdAt: 1 };
	const publisher = PresencePublisher.start({ profile, sessionId: "peer", label: "Review", activity: [] });
	t.after(() => publisher.dispose());
	const cache = new OrchestratorStateCache();
	const manager = { getSessionId: () => "peer", getCwd: () => "/repo", getBranch: () => [] };
	cache.load(manager);
	cache.publish(manager, { objective: "PRIVATE", work: { area: "Auth" } }, () => {}, 1);
	publisher.updateDiscovery(peer, { workspace: "/repo", tasks: [], state: cache.get(manager) });
	const publish = (state: unknown, tasks: { id: string; label: string; status: string; cwd: string }[] = []) => {
		cache.publish(manager, state, () => {}, 2);
		const scope = new OrchestratorScopeCache(path => path === "/unknown" ? undefined : ({ root: path, commonDir: "/clone" }), () => 3)
			.project("/recorded", tasks, []);
		publisher.updateDiscovery(peer, { workspace: "/launch", tasks, scope, state: cache.get(manager) });
	};
	const sidecar = join(profile, "gentle-agents", "presence", `${publisher.target.sessionHash}.${publisher.target.incarnation}.discovery.json`);
	return { profile, peer, publisher, cache, manager, publish, sidecar };
}

test("explicit work projection exports classification only; default discovery stays unchanged", t => {
	const { profile, peer } = fixture(t);
	const candidate = discoverOrchestrators(profile, [peer], Date.now(), { includeWork: true })[0];
	assert.deepEqual(candidate.workRecord, { work: { area: "Auth" }, recordedAt: 1 });
	assert.equal(candidate.state, undefined);
	assert.equal(discoverOrchestrators(profile, [peer], Date.now(), { recipientSessionId: "peer", includeWork: true })[0].state, undefined);
	assert.doesNotMatch(JSON.stringify(candidate), /PRIVATE/);
	assert.equal(discoverOrchestrators(profile, [peer])[0].workRecord, undefined);
});

test("provided empty recipients never broaden discovery; invalid query selections reject before I/O", t => {
	const { profile, peer } = fixture(t);
	assert.deepEqual(discoverOrchestrators(profile, [peer], Date.now(), { recipientSessionId: "" }), []);
	assert.equal(discoverOrchestrators(profile, [peer]).length, 1);
	assert.equal(discoverOrchestrators(profile, [peer], Date.now(), {}).length, 1);
	for (const selection of [null, [], false, 1, "peer", { recipientSessionId: "" }, { recipientSessionId: 1 },
		{ recipientSessionId: "x".repeat(257) }, { recipientSessionId: "\u0000" }, { recipientSessionId: "\ud800" }])
		assert.throws(() => searchPublishedWork(undefined as never, [peer], {}, selection as never), /invalid-work-selection/);
	assert.equal(searchPublishedWork(profile, [peer], {}, { recipientSessionId: " peer " }).coverage.examinedPeers, 0);
});

const ref = { kind: "issue" as const, repository: "github.com/Owner/Repo", id: "12" };
test("AND filters fold human spelling only; refs keep exact repository, kind and ID", t => {
	const { profile, peer, publish } = fixture(t);
	publish({ objective: "SECRET", work: { area: " Café ", topic: "Login", tags: ["Review"], refs: [ref] } });
	const query = (filter: unknown) => searchPublishedWork(profile, [peer], filter);
	const result = query({ area: "CAFE\u0301", topic: " LOGIN ", tag: "review", text: "VIEW", ref });
	assert.deepEqual(result.matches[0].reasons, ["area", "topic", "tag", "text", "ref"]);
	assert.equal(result.matches[0].work.area, " Café ");
	for (const filter of [{ area: "Other" }, { text: "SECRET" }, { tag: "other" },
		{ ref: { ...ref, repository: "github.com/Owner/Other" } }, { ref: { ...ref, kind: "pr" } },
		{ ref: { ...ref, repository: "github.com/owner/repo" } }, { ref: { ...ref, id: "13" } }]) assert.equal(query(filter).matches.length, 0);
	result.matches[0].work.tags!.push("mutated");
	assert.deepEqual(query({}).matches[0].work.tags, ["Review"]);
	assert.equal(result.ownerReply, false);
	assert.equal(result.authority, "none");
	assert.equal(result.matches[0].recordedAt, 2);
	assert.ok(result.observedAt > 2);
	assert.doesNotMatch(JSON.stringify(result), /SECRET|endpoint|activation|capabilities|cursor/);
});

test("tasks join only current page exact IDs; recorded roots never inherit or resolve launch paths", t => {
	const { profile, peer, publish } = fixture(t);
	const tasks = Array.from({ length: 65 }, (_, i) => ({ id: `t${i}`, label: `Task ${i}`, status: "running", cwd: i === 1 ? "/unknown" : "/child" }));
	publish({ work: { area: "Parent", tasks: { t0: { area: "Child" }, t1: { tags: ["Unknown"] }, ghost: { area: "Ghost" }, t9: { area: "Later" } } } }, tasks);
	const query = (filter: unknown = {}, selection?: { recipientSessionId?: string; cursor?: string }) => searchPublishedWork(profile, [peer], filter, selection);
	const result = query();
	assert.deepEqual(result.matches.map(m => m.taskId), [undefined, "t0", "t1"]);
	assert.equal(result.coverage.unmatchedTaskAnnotations, 2);
	assert.equal(result.coverage.pendingCatalogPages, 1);
	assert.equal(result.coverage.catalogOmittedTasks, 1);
	assert.equal(query({ area: "Ghost" }).matches.length, 0);
	assert.equal(query({ area: "Later" }).matches.length, 0);
	assert.equal(query({ repository_root: "/recorded" }).matches.length, 1);
	assert.equal(query({ repository_root: "/launch" }).matches.length, 0);
	assert.equal(query({ area: "Child", repository_root: "/recorded" }).matches.length, 0);
	assert.equal(query({ repository_root: "/child" }).matches[0].taskId, "t0");
	assert.equal(query({ tag: "Unknown", repository_root: "/unknown" }).matches.length, 0);
	assert.equal(result.matches[2].repository?.root, null);
	assert.equal(result.matches[0].repository?.resolvedAt, 3);
	const cursor = discoverOrchestrators(profile, [peer])[0].catalog!.cursor!;
	assert.throws(() => query({}, { cursor }), /requires-recipient/);
	assert.equal(query({ area: "Later" }, { recipientSessionId: "peer", cursor }).matches[0].taskId, "t9");
	assert.equal(query({}, { recipientSessionId: "peer", cursor: "invalid" }).coverage.catalogUnknown, 1);
	publish({ work: { tasks: { ghost: { area: "Finished" } } } }, []);
	assert.equal(query().matches.length, 0);
	assert.equal(query().coverage.unmatchedTaskAnnotations, 1);
	publish({ work: { area: "Parent" } }, [{ id: "toString", label: "Unclassified", status: "running", cwd: "/child" }]);
	assert.equal(query().matches.length, 1, "prototype keys cannot become task annotations");
});

test("strict filters reject before profile access, including deferred related-source mode", () => {
	for (const filter of [null, [], { related_to: { session_id: "peer" } }, { topic: "x" }, { area: "" }, { tag: 1 },
		{ area: "😀".repeat(17) }, { text: "x".repeat(1025) }, { text: "\u0000" }, { text: "\ud800" },
		{ ref: { ...ref, id: "012" } }, { ref: { ...ref, extra: true } }, { repository_root: "relative" },
		{ repository_root: "/" + "r".repeat(256) }, { repository_root: "/a\u00a0b" }]) {
		assert.throws(() => searchPublishedWork(undefined as never, [], filter), /invalid-work-filter/);
	}
	for (const separator of ["\u00a0", ...Array.from({ length: 11 }, (_, i) => String.fromCharCode(0x2000 + i)), "\u202f", "\u205f", "\u3000"])
		assert.throws(() => validateWorkFilter({ repository_root: `/a${separator}b` }), /invalid-work-filter/);
	assert.deepEqual(validateWorkFilter({}), {});
});

test("nullable classification, malformed/foreign notes, stale/ambiguous presence and rejected scans fail closed", t => {
	const { profile, peer, publish, sidecar } = fixture(t);
	const query = (peers = [peer], now = Date.now()) => searchPublishedWork(profile, peers, {}, undefined, now);
	publish(null);
	assert.equal(query().coverage.unclassified, 1);
	assert.deepEqual(discoverOrchestrators(profile, [peer], Date.now(), { includeWork: true })[0].workRecord, { work: null, recordedAt: 2 });
	publish({ work: { area: "Auth" } });
	const snapshot = JSON.parse(readFileSync(sidecar, "utf8"));
	for (const state of [{ ...snapshot.metadata.state, sessionId: "foreign" }, { ...snapshot.metadata.state, state: { work: { area: 12 } } }]) {
		writeFileSync(sidecar, JSON.stringify({ ...snapshot, metadata: { ...snapshot.metadata, state } }));
		assert.equal(query().coverage.unknownContext, 1);
		assert.equal(discoverOrchestrators(profile, [peer])[0].workspace, "/launch");
	}
	writeFileSync(sidecar, JSON.stringify(snapshot));
	assert.equal(query([peer], Date.now() + 20000).matches.length, 0);
	assert.equal(query([peer, { ...peer, endpoint: "/duplicate" }]).coverage.unknownContext, 1);
	assert.equal(query([{ ...peer, endpoint: "/replacement" }]).matches.length, 0);
	writeFileSync(join(profile, "gentle-agents", "presence", "bad.header.json"), "invalid");
	assert.equal(query().matches.length, 0);
	assert.equal(query().coverage.unknownContext, 1);
});

test("64 unique-peer cap is deterministic; whole-row byte omissions account for all matches", t => {
	const { profile, peer } = fixture(t);
	const peers = Array.from({ length: 66 }, (_, i) => ({ ...peer, sessionId: `p${String(i).padStart(2, "0")}`, endpoint: `/activation/${i}` }));
	const work = { area: "界".repeat(20), tags: Array.from({ length: 8 }, (_, i) => "界".repeat(20) + i),
		refs: [{ ...ref, kind: "task" as const, id: "x".repeat(256) }] };
	for (const p of peers.slice(0, 20)) {
		const pub = PresencePublisher.start({ profile, sessionId: p.sessionId, label: "Work", activity: [] });
		t.after(() => pub.dispose());
		const cache = new OrchestratorStateCache();
		const manager = { getSessionId: () => p.sessionId, getCwd: () => "/repo", getBranch: () => [] };
		cache.load(manager);
		cache.publish(manager, { work }, () => {}, 1);
		pub.updateDiscovery(p, { workspace: "/repo", tasks: [], state: cache.get(manager) });
	}
	const result = searchPublishedWork(profile, peers);
	assert.equal(result.coverage.examinedPeers, 64);
	assert.equal(result.coverage.unexaminedPeers, 2);
	assert.equal(result.coverage.exhaustive, false);
	assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
	assert.ok(result.coverage.omittedMatches > 0);
	assert.equal(result.matches.length + result.coverage.omittedMatches, 20);
	assert.deepEqual(result.matches[0].work, work);
	assert.deepEqual(searchPublishedWork(profile, [...peers].reverse(), {}, undefined, result.observedAt), result);
	assert.equal(searchPublishedWork(profile, [...peers, { ...peers[0], endpoint: "/duplicate" }]).coverage.unknownContext, 45);
	assert.equal(result.coverage.unknownContext, 44);
	// Directory entries, not admitted headers, bound the presence scan.
	for (let i = 0; i < 130; i++) writeFileSync(join(profile, "gentle-agents", "presence", `overflow-${i}`), "");
	assert.equal(searchPublishedWork(profile, peers).coverage.unknownContext, 64);
});
