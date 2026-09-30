import assert from "node:assert/strict";
import test from "node:test";
import { createEventBus, createExtensionRuntime, ExtensionRunner, SessionManager, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { loadExtensionFromFactory } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js";
import { registerYoloSessionPolicy, YOLO_STATUS_KEY, YOLO_STATUS_TEXT } from "../lib/yolo-session-policy.ts";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";

test("complete Gentle AI extension registers and executes YOLO through the actual SDK loader", async () => {
	const cwd = process.cwd();
	const runtime = createExtensionRuntime();
	const extension = await loadExtensionFromFactory(createGentleAiExtension({ nativeReviewCli: null, candidateViews: null, processEnv: {} }), cwd, createEventBus(), runtime);
	assert.equal(extension.handlers.get("session_start")?.length, 1, "original startup hook remains the sole handler");
	assert.equal(extension.handlers.get("session_shutdown")?.length, 1, "original shutdown hook remains the sole handler");
	const runner = new ExtensionRunner([extension], runtime, cwd, SessionManager.inMemory(cwd), {} as never);
	const statuses = new Map<string, string | undefined>();
	runner.setUIContext({ notify() {}, setStatus: (key: string, text?: string) => statuses.set(key, text), setWidget() {}, getAllThemes: () => [{ name: "test" }] } as unknown as ExtensionUIContext, "tui");
	runner.bindCommandContext();
	assert.equal(runner.getAllRegisteredTools().some(({ definition }) => definition.name.includes("yolo")), false);
	const command = runner.getCommand("yolo"); assert.ok(command);
	await command.handler("on", runner.createCommandContext());
	assert.equal(statuses.get(YOLO_STATUS_KEY), YOLO_STATUS_TEXT);
	await command.handler("off", runner.createCommandContext());
	assert.equal(statuses.get(YOLO_STATUS_KEY), undefined);
	await command.handler("on", runner.createCommandContext());
	await runner.emit({ type: "session_shutdown", reason: "reload" });
	assert.equal(statuses.get(YOLO_STATUS_KEY), undefined, "production shutdown hook resets even on reload");
	await command.handler("status", runner.createCommandContext());
	assert.equal(statuses.get(YOLO_STATUS_KEY), undefined);
	runner.invalidate();
});

// Actual SDK factory loader, context/command runner and in-memory SessionManager.
// Lifecycle events are dispatched through the real runner; the terminal UI is stubbed.
// No providers, persisted sessions, global assets or real tool execution are needed.
test("SDK-loaded YOLO command resets across actual runner lifecycle dispatch and extension replacement", async () => {
	const cwd = process.cwd();
	const manager = SessionManager.inMemory(cwd);
	const statuses = new Map<string, string | undefined>();
	const widgets = new Map<string, unknown>();
	const ui = {
		setStatus: (key: string, text?: string) => statuses.set(key, text),
		setWidget: (key: string, value: unknown) => widgets.set(key, value),
		notify() {}, getAllThemes: () => [{ name: "test" }],
	} as unknown as ExtensionUIContext;
	const load = async () => {
		const runtime = createExtensionRuntime();
		const extension = await loadExtensionFromFactory((pi) => {
			const yolo = registerYoloSessionPolicy(pi, {});
			// Match production ownership: the host's existing hooks reset the controller.
			pi.on("session_start", (_event, ctx) => yolo.reset(ctx));
			pi.on("session_shutdown", (_event, ctx) => yolo.reset(ctx));
		}, cwd, createEventBus(), runtime);
		const runner = new ExtensionRunner([extension], runtime, cwd, manager, {} as never);
		runner.setUIContext(ui, "tui");
		runner.bindCommandContext();
		return runner;
	};
	let runner = await load();
	const command = async (args: string) => {
		const registered = runner.getCommand("yolo"); assert.ok(registered);
		await registered.handler(args, runner.createCommandContext());
	};
	await runner.emit({ type: "session_start", reason: "startup" });
	await command("status"); assert.equal(statuses.get(YOLO_STATUS_KEY), undefined);
	for (const reason of ["reload", "new", "resume", "fork", "quit"] as const) {
		await command("on"); assert.equal(statuses.get(YOLO_STATUS_KEY), YOLO_STATUS_TEXT);
		await runner.emit({ type: "session_shutdown", reason });
		assert.equal(statuses.get(YOLO_STATUS_KEY), undefined);
		assert.equal(widgets.get(YOLO_STATUS_KEY), undefined);
		runner.invalidate();
		runner = await load();
		if (reason !== "quit") await runner.emit({ type: "session_start", reason });
		await command("status"); assert.equal(statuses.get(YOLO_STATUS_KEY), undefined);
	}
	await command("on");
	manager.newSession();
	await command("status"); assert.equal(statuses.get(YOLO_STATUS_KEY), undefined, "live SDK session ID replacement revokes without relying on an event");
	runner.setUIContext(ui, "rpc");
	await command("on"); assert.equal(statuses.get(YOLO_STATUS_KEY), undefined);
});
