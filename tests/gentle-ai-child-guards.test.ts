import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";
import { bindSessionRepositoryPreparation } from "../lib/bounded-writer-admission.ts";

// gentle-shell#1690: the package is forwarded to delegated rpc children
// (GENTLE_PI_AGENTS_CHILD=1, where ctx.hasUI is true). Parent-owned startup
// work and shared-state writes must not run there; each case pairs the child
// with a parent control so the guard cannot pass vacuously.

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function isolate(t: TestContext): { root: string; cwd: string; agentHome: string } {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "gentle-pi-child-guards-")));
	const cwd = join(root, "project");
	const agentHome = join(root, "agent-home");
	const configHome = join(root, "config");
	for (const path of [cwd, agentHome, configHome]) mkdirSync(path, { recursive: true });
	const previous = { agentHome: process.env.GENTLE_PI_AGENT_HOME, configHome: process.env.GENTLE_PI_CONFIG_HOME };
	process.env.GENTLE_PI_AGENT_HOME = agentHome;
	process.env.GENTLE_PI_CONFIG_HOME = configHome;
	t.after(() => {
		if (previous.agentHome === undefined) delete process.env.GENTLE_PI_AGENT_HOME;
		else process.env.GENTLE_PI_AGENT_HOME = previous.agentHome;
		if (previous.configHome === undefined) delete process.env.GENTLE_PI_CONFIG_HOME;
		else process.env.GENTLE_PI_CONFIG_HOME = previous.configHome;
		rmSync(root, { recursive: true, force: true });
	});
	return { root, cwd, agentHome };
}

function harness(child: boolean, cwd: string) {
	const handlers = new Map<string, Handler>();
	const entries: Array<{ type: string; customType: string; data: unknown }> = [];
	const nativeAccesses: string[] = [];
	const sweeps: string[] = [];
	const prompts: string[] = [];
	const pi = {
		on: (name: string, handler: Handler) => { handlers.set(name, handler); },
		events: { on() {}, emit() {} },
		appendEntry: (customType: string, data: unknown) => { entries.push({ type: "custom", customType, data }); },
		getThinkingLevel: () => "medium",
		registerTool() {}, registerCommand() {}, registerShortcut() {}, registerMessageRenderer() {},
	} as unknown as ExtensionAPI;
	// Any read of the native CLI means the session reached review negotiation
	// or repository preparation.
	const nativeReviewCli = new Proxy({}, {
		get: (_target, key) => { nativeAccesses.push(String(key)); return undefined; },
	});
	const candidateViews = { sweepOrphans: (path: string) => { sweeps.push(path); }, cleanupAll() {} };
	createGentleAiExtension({
		processEnv: { GENTLE_PI_AGENTS_CHILD: child ? "1" : "0", GENTLE_AI_TELEMETRY: "0" },
		nativeReviewCli: nativeReviewCli as never,
		candidateViews: candidateViews as never,
		childStandingReviewPermissionClient: { requestAuthorization: async () => false, close() {} },
	})(pi);
	const sessionManager = { getSessionId: () => `session-${child ? "child" : "parent"}`, getCwd: () => cwd, getEntries: () => entries, getBranch: () => entries };
	const ctx = {
		cwd,
		mode: "rpc",
		hasUI: true,
		sessionManager,
		ui: {
			notify() {}, setStatus() {},
			confirm: async (title: string) => { prompts.push(`confirm:${title}`); return false; },
			select: async (title: string) => { prompts.push(`select:${title}`); return undefined; },
		},
	} as unknown as ExtensionContext;
	return { handlers, entries, nativeAccesses, sweeps, prompts, ctx, sessionManager };
}

function legacySettings(cwd: string): string {
	const path = join(cwd, ".pi", "settings.json");
	mkdirSync(join(cwd, ".pi"), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ subagents: { agentOverrides: { worker: "openai/gpt-5" } } }, null, 2)}\n`);
	return path;
}

test("child session_start keeps local resets but skips parent-owned startup work", async (t) => {
	const { cwd, agentHome } = isolate(t);
	const settingsPath = legacySettings(cwd);
	const before = readFileSync(settingsPath, "utf8");
	const h = harness(true, cwd);
	await h.handlers.get("session_start")!({ reason: "startup" }, h.ctx);
	assert.deepEqual(readdirSync(agentHome), [], "a child must not install package assets");
	assert.equal(readFileSync(settingsPath, "utf8"), before, "a child must not migrate project model overrides");
	assert.deepEqual(h.sweeps, [], "a child must not sweep candidate views");
	assert.deepEqual(h.nativeAccesses, [], "a child must not negotiate review status or bind repository preparation");
});

test("parent session_start still runs the startup work skipped in children", async (t) => {
	const { cwd, agentHome } = isolate(t);
	const settingsPath = legacySettings(cwd);
	const before = readFileSync(settingsPath, "utf8");
	const h = harness(false, cwd);
	await h.handlers.get("session_start")!({ reason: "startup" }, h.ctx);
	assert.notDeepEqual(readdirSync(agentHome), [], "the parent installs package assets");
	assert.notEqual(readFileSync(settingsPath, "utf8"), before, "the parent migrates legacy project model overrides");
	assert.deepEqual(h.sweeps, [cwd]);
	assert.ok(h.nativeAccesses.length > 0, "the parent negotiates review status");
});

async function writeToolResult(child: boolean, t: TestContext) {
	const { cwd } = isolate(t);
	mkdirSync(join(cwd, "src"), { recursive: true });
	writeFileSync(join(cwd, "src", "a.ts"), "export {};\n");
	const h = harness(child, cwd);
	await h.handlers.get("session_start")!({ reason: "startup" }, h.ctx);
	// Bind an observable preparation on the same session owner the parent
	// session_start would have bound, so only the tool_result guard decides.
	const preparations: string[] = [];
	const unbind = bindSessionRepositoryPreparation(h.sessionManager, cwd, async (root) => { preparations.push(root); return false; }, () => true);
	t.after(unbind);
	await h.handlers.get("tool_result")!({ toolName: "write", toolCallId: "call-1", isError: false, input: { path: "src/a.ts" } }, h.ctx);
	const mutations = h.entries.filter((entry) => (entry.data as { kind?: string })?.kind === "mutation");
	return { cwd, preparations, mutations };
}

test("child tool_result records the mutation but never prepares the bound repository", async (t) => {
	const { preparations, mutations } = await writeToolResult(true, t);
	assert.equal(mutations.length, 1, "the child keeps its own mutation receipt");
	assert.deepEqual(preparations, []);
});

test("parent tool_result still prepares the bound repository", async (t) => {
	const { cwd, preparations, mutations } = await writeToolResult(false, t);
	assert.equal(mutations.length, 1);
	assert.deepEqual(preparations, [cwd]);
});

test("child confirm-class guardrail commands ask the parent instead of running or blocking headlessly", async (t) => {
	const { cwd } = isolate(t);
	const h = harness(true, cwd);
	const result = await h.handlers.get("tool_call")!({ toolName: "bash", input: { command: "pi remove some-package" } }, h.ctx) as { block?: boolean; reason?: string } | undefined;
	assert.equal(h.prompts.length, 1, JSON.stringify(h.prompts));
	assert.equal(result?.block, true, "the declined confirmation blocks the command");
	assert.doesNotMatch(result?.reason ?? "", /requires interactive confirmation/);
});
