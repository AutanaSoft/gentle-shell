import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension, __testing } from "../extensions/gentle-ai.ts";

// gentle-shell#1731 S3/AC3: the primary-session harness carries one runtime
// "Model routing" fact computed from the orchestrator model, the effective
// gentle-ai-worker model, and catalog prices. It lives in the harness section,
// outside the memoized 8,192 B orchestrator core, and never throws.

type BeforeAgentStartHandler = (event: unknown, ctx: ExtensionContext) => Promise<undefined>;
type MutableEvent = { agentName?: string; systemPrompt: string; systemPromptOptions: { appendSystemPrompt: string } };

const ROUTING_LINE = "Model routing: orchestrator anthropic/fable costs 3.0x the worker anthropic/opus (input 3.0x, output 3.0x).";

let fixtureRoot: string;
let fixtureCwd: string;
let agentHome: string;
const fixtureEnvironment: NodeJS.ProcessEnv = {};
const previousEnvironment = new Map<string, string | undefined>();
before(() => {
	fixtureRoot = mkdtempSync(join(tmpdir(), "gentle-pi-model-routing-prompt-"));
	fixtureCwd = join(fixtureRoot, "project");
	const home = join(fixtureRoot, "home");
	agentHome = join(home, "agents-home");
	mkdirSync(fixtureCwd);
	mkdirSync(join(agentHome, "agents"), { recursive: true });
	writeFileSync(join(agentHome, "agents", "gentle-ai-worker.md"), "---\nname: gentle-ai-worker\ndescription: Worker.\n---\nBody.\n");
	writeFileSync(join(agentHome, "subagents.json"), JSON.stringify({ model_profiles: { "gentle-ai-worker": { model: "anthropic/opus" } } }));
	Object.assign(fixtureEnvironment, {
		HOME: home, USERPROFILE: home,
		GENTLE_PI_CONFIG_HOME: join(home, "config"),
		GENTLE_PI_AGENT_HOME: agentHome,
		PI_CODING_AGENT_DIR: join(home, "pi"),
		XDG_CONFIG_HOME: join(home, "xdg"),
	});
	for (const [key, value] of Object.entries(fixtureEnvironment)) {
		previousEnvironment.set(key, process.env[key]);
		process.env[key] = value;
	}
});
after(() => {
	for (const [key, value] of previousEnvironment) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(fixtureRoot, { recursive: true, force: true });
});

function harness(): BeforeAgentStartHandler {
	const handlers = new Map<string, BeforeAgentStartHandler>();
	const pi = {
		on(name: string, handler: BeforeAgentStartHandler) {
			handlers.set(name, handler);
		},
		events: { emit() {} },
		registerCommand() {},
		registerTool() {},
	} as unknown as ExtensionAPI;
	createGentleAiExtension({
		nativeReviewCli: null,
		processEnv: { ...fixtureEnvironment, GENTLE_PI_AGENTS_CHILD: "0", GENTLE_AI_TELEMETRY: "0" },
		resolveTelemetryTriggerBinary: () => join(fixtureCwd, "never-executed"),
		telemetryTriggerSpawn: () => assert.fail("Model routing fixtures must not spawn telemetry"),
	})(pi);
	const beforeAgentStart = handlers.get("before_agent_start");
	assert.equal(typeof beforeAgentStart, "function");
	return beforeAgentStart as BeforeAgentStartHandler;
}

const catalog = [
	{ provider: "anthropic", id: "fable", cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 } },
	{ provider: "anthropic", id: "opus", cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
];
const registry = {
	find: (provider: string, id: string) => catalog.find((model) => model.provider === provider && model.id === id),
	getAll: () => catalog,
};

function ctx(overrides: Record<string, unknown> = {}): ExtensionContext {
	return {
		cwd: fixtureCwd,
		hasUI: true,
		ui: { notify() {} },
		sessionManager: { getSessionId: () => "model-routing-prompt-session" },
		model: catalog[0],
		modelRegistry: registry,
		...overrides,
	} as unknown as ExtensionContext;
}

function primaryEvent(overrides: Partial<MutableEvent> = {}): MutableEvent {
	return { systemPrompt: "base", systemPromptOptions: { appendSystemPrompt: "" }, ...overrides };
}

test("buildGentlePrompt places the model routing line in the harness section, outside the orchestrator core", () => {
	const rddLine = __testing.renderRddStatusLine(undefined);
	const prompt = __testing.buildGentlePrompt("neutral", fixtureCwd, undefined, rddLine, ROUTING_LINE);
	const core = __testing.getOrchestratorPrompt(fixtureCwd, undefined, rddLine);
	const lineIndex = prompt.indexOf(`\n${ROUTING_LINE}\n`);
	assert.ok(lineIndex > prompt.indexOf("Harness principles:"), "the fact belongs to the harness section");
	assert.ok(lineIndex < prompt.indexOf(core), "the fact precedes the memoized orchestrator core");
	assert.ok(!core.includes("Model routing:"), "the orchestrator core never carries the fact");
	assert.equal(prompt.split("Model routing:").length - 1, 1);
});

test("buildGentlePrompt without a model routing line renders no fact", () => {
	const prompt = __testing.buildGentlePrompt("neutral", fixtureCwd, undefined, __testing.renderRddStatusLine(undefined));
	assert.doesNotMatch(prompt, /Model routing:/);
});

test("before_agent_start injects the runtime-computed ratio for the primary session", async () => {
	const event = primaryEvent();
	await harness()(event, ctx());
	const appended = event.systemPromptOptions.appendSystemPrompt;
	assert.ok(appended.includes(ROUTING_LINE), appended.slice(0, 200));
	assert.equal(appended.split("Model routing:").length - 1, 1);
});

test("before_agent_start renders the unknown line when the orchestrator model is missing", async () => {
	const event = primaryEvent();
	await harness()(event, ctx({ model: undefined }));
	assert.match(event.systemPromptOptions.appendSystemPrompt, /\nModel routing: price ratio unknown \(orchestrator model unknown\)\.\n/);
});

test("before_agent_start renders the unknown line instead of throwing when the catalog fails", async () => {
	const event = primaryEvent();
	const failing = { find: () => { throw new Error("catalog offline"); }, getAll: () => { throw new Error("catalog offline"); } };
	await harness()(event, ctx({ modelRegistry: failing }));
	assert.match(event.systemPromptOptions.appendSystemPrompt, /\nModel routing: price ratio unknown \([^)]+\)\.\n/);
});

test("before_agent_start never injects the fact into a named agent session", async () => {
	const event = primaryEvent({ agentName: "gentle-ai-worker" });
	await harness()(event, ctx());
	assert.doesNotMatch(event.systemPromptOptions.appendSystemPrompt, /Model routing:/);
});
