import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildNotificationRows } from "../lib/notification-customize.ts";
import { claimNotificationOwner, getNotificationService } from "../lib/notification-service.ts";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "../lib/notification-policy.ts";
import { VisualCustomizeView, type CustomizeInline, type CustomizeRow } from "../lib/visual-customize-view.ts";
import { fileURLToPath } from "node:url";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A real packaged WAV so the valid path uses an existing fixture, not a synthetic name. */
const WAV_FIXTURE = fileURLToPath(new URL("../assets/sounds/success.wav", import.meta.url));

function harness(options: { malformed?: boolean; failWrite?: boolean } = {}) {
	const notes: string[] = [];
	const nested = { select: 0, input: 0, confirm: 0 };
	let writes = 0; let probes = 0; let played = 0;
	let settings = structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
	const ctx = { mode: "tui", hasUI: true, sessionManager: { getSessionId: () => "nc-session" }, ui: {
		select: async () => { nested.select++; return undefined; },
		input: async () => { nested.input++; return undefined; },
		confirm: async () => { nested.confirm++; return false; },
		notify: (text: string) => notes.push(text),
	} } as unknown as ExtensionContext;
	const owner = claimNotificationOwner(() => {}, { env: {},
		read: () => ({ settings, source: "global_file", malformed: options.malformed ?? false, readError: false, globalFile: "/config/notifications.json" }),
		write: (next: NotificationSettings) => { writes++; if (options.failWrite) throw Error("private"); settings = next; return "/config/notifications.json"; },
		backend: { availability: async () => { probes++; return "available"; }, play: async (_sound, _signal, permit) => { if (permit.start()) played++; } },
	});
	owner.attach(ctx); getNotificationService()!.setMuted(ctx, false);
	return { ctx, owner, notes, nested, get writes() { return writes; }, get probes() { return probes; }, get played() { return played; },
		rows: () => buildNotificationRows(ctx) };
}

function findRow(rows: CustomizeRow[], label: string | RegExp): CustomizeRow {
	const found = rows.find(row => { const text = typeof row.label === "function" ? row.label() : row.label; return typeof label === "string" ? text.startsWith(label) : label.test(text); });
	assert.ok(found, `missing row ${label}`);
	return found!;
}

function fakeInline(inputs: (string | undefined)[] = [], confirms: boolean[] = []): CustomizeInline {
	return { input: async () => inputs.shift(), confirm: async () => confirms.shift() ?? false, disposed: false };
}
function label(row: CustomizeRow): string { return typeof row.label === "function" ? row.label() : row.label; }

test("Notifications rows toggle, mute and restore directly without any nested native dialog", async () => {
	const h = harness(); try {
		const rows = h.rows();
		await findRow(rows, "Audio notifications: off").action(fakeInline());
		assert.equal(getNotificationService()!.getState().settings.enabled, true);
		assert.equal(h.writes, 1);
		await findRow(rows, "Audio: unmuted").action(fakeInline());
		assert.equal(getNotificationService()!.getState().muted, true);
		assert.equal(h.writes, 1, "mute persists in-process without writing configuration");
		await findRow(rows, "Audio: restore preset").action(fakeInline());
		assert.equal(getNotificationService()!.getState().settings.enabled, true, "restore preserves enabled");
		assert.equal(h.writes, 2);
		assert.deepEqual(h.nested, { select: 0, input: 0, confirm: 0 });
	} finally { h.owner.retire(); }
});

test("labels and previews never probe, play or write; availability is explicit", async () => {
	const h = harness(); try {
		const rows = h.rows();
		for (const row of rows) { label(row); row.preview?.(); }
		assert.equal(h.probes, 0); assert.equal(h.played, 0); assert.equal(h.writes, 0);
		await findRow(rows, "Audio availability: check").action(fakeInline());
		assert.equal(h.probes, 1);
		assert.equal(h.writes, 0);
	} finally { h.owner.retire(); }
});

test("event rows cycle independently and p tests the selected sound without writing", async () => {
	const h = harness(); try {
		const rows = h.rows();
		const failed = findRow(rows, "agent.failed:");
		assert.match(label(failed), /builtin:error/);
		await failed.action(fakeInline());
		assert.equal(getNotificationService()!.getState().settings.audio.events["agent.failed"], "builtin:attention");
		assert.equal(getNotificationService()!.getState().settings.audio.events["agent.completed"], "builtin:success");
		assert.equal(h.writes, 1);
		assert.equal(failed.key!("p", fakeInline()), true);
		await tick(); await tick();
		assert.equal(h.played, 1);
		assert.equal(h.writes, 1, "preview never writes");
		assert.deepEqual(h.nested, { select: 0, input: 0, confirm: 0 });
	} finally { h.owner.retire(); }
});

test("f opens an inline field; a valid WAV saves while invalid content never writes", async () => {
	const h = harness(); try {
		const rows = h.rows();
		const validated: string[] = [];
		getNotificationService()!.validateFile = async (_ctx, sound) => { validated.push(sound); return true; };
		const event = findRow(rows, "agent.failed:");
		const pending = event.key!("f", fakeInline(["/local/my sound.wav"]));
		assert.ok(pending, "the f shortcut consumes the key through an async task");
		await pending;
		await tick(); await tick();
		assert.deepEqual(validated, ["file:/local/my sound.wav"]);
		assert.equal(getNotificationService()!.getState().settings.audio.events["agent.failed"], "file:/local/my sound.wav");
		assert.equal(h.writes, 1);
		assert.equal(h.nested.input, 0, "the row never opens a native input dialog");
	} finally { h.owner.retire(); }

	const invalid = harness(); try {
		const rows = invalid.rows();
		findRow(rows, "agent.failed:").key!("f", fakeInline([fileURLToPath(new URL("../package.json", import.meta.url))]));
		await tick(); await tick();
		assert.equal(invalid.writes, 0);
	} finally { invalid.owner.retire(); }
});

test("cancelled file input and unsupported URL never validate or write", async () => {
	for (const input of [undefined, "https://example.test/sound.wav"]) {
		const h = harness(); try {
			const rows = h.rows();
			findRow(rows, "agent.failed:").key!("f", fakeInline([input]));
			await tick(); await tick();
			assert.equal(h.writes, 0);
		} finally { h.owner.retire(); }
	}
});

test("malformed configuration needs fresh strict consent per attempt; a failed write grants none", async () => {
	for (const failWrite of [false, true]) {
		const h = harness({ malformed: true, failWrite }); try {
			const rows = h.rows();
			const enable = findRow(rows, "Audio notifications:");
			await enable.action(fakeInline([], [false]));
			assert.equal(h.writes, 0, "cancel preserves the file and settings");
			assert.equal(getNotificationService()!.getState().malformed, true);
			await enable.action(fakeInline([], [true]));
			assert.equal(h.writes, 1, `confirmed attempt must run once (failWrite=${failWrite})`);
			if (failWrite) {
				assert.equal(getNotificationService()!.getState().malformed, true);
				await enable.action(fakeInline([], [false]));
				assert.equal(h.writes, 1, "a failed write cannot reuse prior consent");
				await enable.action(fakeInline([], [true]));
				assert.equal(h.writes, 2);
			}
		} finally { h.owner.retire(); }
	}
});

test("owner replacement during validation cannot persist a stale choice", async () => {
	const h = harness(); try {
		const rows = h.rows();
		getNotificationService()!.validateFile = async () => { h.owner.attach(h.ctx); return true; };
		findRow(rows, "agent.failed:").key!("f", fakeInline(["/local/sound.wav"]));
		await tick(); await tick();
		assert.equal(h.writes, 0);
	} finally { h.owner.retire(); }
});

test("closing the card during validation cannot persist a choice", async () => {
	const h = harness(); try {
		const rows = h.rows();
		const fake = fakeInline(["/local/sound.wav"]);
		getNotificationService()!.validateFile = async () => { fake.disposed = true; return true; };
		findRow(rows, "agent.failed:").key!("f", fake);
		await tick(); await tick();
		assert.equal(h.writes, 0);
	} finally { h.owner.retire(); }
});

function customizeView(rows: CustomizeRow[], onClose: () => void = () => {}) {
	return new VisualCustomizeView({ rows, theme: { fg: (_role: string, text: string) => text }, rowsAvailable: () => 24, requestRender: () => {}, onClose,
		profiles: { list: () => [], save: () => {}, apply: () => {}, delete: () => {}, reset: () => {} } });
}

/** Selects the event row by its live label, never by a brittle hard-coded index. */
function selectRow(view: VisualCustomizeView, rows: CustomizeRow[], label: string): void {
	view.render(76);
	view.handleInput("\x1b[C");
	const target = rows.findIndex(row => (typeof row.label === "function" ? row.label() : row.label).startsWith(label));
	assert.ok(target > 0, `missing selectable row ${label}`);
	for (let i = 0; i < target; i++) view.handleInput("\x1b[B");
}

test("an in-flight local WAV validation keeps busy, blocking a second field and any write until it settles", async () => {
	const h = harness(); try {
		const rows = h.rows();
		let resolveValidation!: (value: boolean) => void;
		const validated: string[] = [];
		getNotificationService()!.validateFile = (_ctx, sound) => { validated.push(sound); return new Promise<boolean>(resolve => { resolveValidation = resolve; }); };
		const view = customizeView(rows);
		selectRow(view, rows, "agent.failed:");
		assert.match(view.render(160).join("\n"), /agent\.failed:/);
		view.handleInput("f");
		assert.match(view.render(160).join("\n"), /Local WAV path/);
		view.handleInput(WAV_FIXTURE);
		view.handleInput("\r");
		await tick();
		assert.deepEqual(validated, [`file:${WAV_FIXTURE}`], "the submitted value is validated exactly once");
		// Validation is still pending: `f` must not open a second field and Enter must not write.
		view.handleInput("f");
		view.handleInput("\r");
		await tick();
		assert.doesNotMatch(view.render(160).join("\n"), /Local WAV path/, "a second f cannot open another field while busy");
		assert.equal(h.writes, 0, "no write before the deferred validation resolves");
		// Resolve: a single write, then busy releases for the next edit.
		resolveValidation(true);
		await tick(); await tick();
		assert.equal(h.writes, 1, "the resolved validation writes exactly once");
		assert.equal(getNotificationService()!.getState().settings.audio.events["agent.failed"], `file:${WAV_FIXTURE}`);
		view.handleInput("f");
		assert.match(view.render(160).join("\n"), /Local WAV path/, "busy is released so the next edit opens a fresh field");
	} finally { h.owner.retire(); }
});

test("Escape cancels the inline field while the async key task is busy and releases it", async () => {
	const h = harness(); try {
		const rows = h.rows();
		getNotificationService()!.validateFile = async () => { throw new Error("validation must not run after a cancelled field"); };
		const view = customizeView(rows);
		selectRow(view, rows, "agent.failed:");
		view.handleInput("f");
		assert.match(view.render(160).join("\n"), /Local WAV path/);
		view.handleInput("\x1b");
		await tick(); await tick();
		assert.doesNotMatch(view.render(160).join("\n"), /Local WAV path/, "Escape cancels the inline field");
		assert.equal(h.writes, 0, "a cancelled field never validates or writes");
		view.handleInput("f");
		assert.match(view.render(160).join("\n"), /Local WAV path/, "busy is released after the cancelled key task");
	} finally { h.owner.retire(); }
});

test("disposing the card while validation is in flight never writes the stale choice", async () => {
	const h = harness(); try {
		const rows = h.rows();
		let resolveValidation!: (value: boolean) => void;
		getNotificationService()!.validateFile = () => new Promise<boolean>(resolve => { resolveValidation = resolve; });
		const view = customizeView(rows);
		selectRow(view, rows, "agent.failed:");
		view.handleInput("f");
		view.render(160);
		view.handleInput(WAV_FIXTURE);
		view.handleInput("\r");
		await tick();
		view.dispose();
		resolveValidation(true);
		await tick(); await tick();
		assert.equal(h.writes, 0, "a disposed card must not persist the validated choice");
	} finally { h.owner.retire(); }
});

test("missing owner yields unavailable labels and no writes or nested dialogs", async () => {
	const h = harness(); try {
		h.owner.retire();
		const rows = h.rows();
		assert.match(label(rows[0]!), /unavailable/);
		await findRow(rows, "Audio notifications:").action(fakeInline());
		assert.equal(h.writes, 0);
		assert.deepEqual(h.nested, { select: 0, input: 0, confirm: 0 });
	} finally { h.owner.retire(); }
});

test("event rows cover supported events and never expose session.shutdown", () => {
	const h = harness(); try {
		const labels = h.rows().map(label);
		assert.ok(labels.some(value => value.startsWith("agent.failed:")));
		assert.ok(labels.some(value => value.startsWith("subagent.timed_out:")));
		assert.ok(labels.some(value => value.startsWith("session.started:")));
		assert.ok(!labels.some(value => value.includes("session.shutdown")));
	} finally { h.owner.retire(); }
});

test("p on every non-event notification control stays on the audio card, opens no profiles and never previews", () => {
	const h = harness(); try {
		const rows = h.rows();
		const nonEvent = rows.filter(row => !row.key);
		assert.equal(nonEvent.length, 4, "four non-event controls are expected before the event rows");
		const listed: number[] = [];
		const view = new VisualCustomizeView({ rows, theme: { fg: (_role: string, text: string) => text }, rowsAvailable: () => 24, requestRender: () => {}, onClose: () => {}, profiles: {
			list: () => { listed.push(1); return []; }, save: () => {}, apply: () => {}, delete: () => {}, reset: () => {},
		} });
		view.render(76);
		view.handleInput("\x1b[C");
		for (const [i, row] of nonEvent.entries()) {
			assert.ok(view.render(76).join("\n").includes(label(row)), `non-event row ${i} (${label(row)}) must be the selected control`);
			view.handleInput("p");
			const frame = view.render(76).join("\n");
			assert.equal(view.title(), "Audio notifications", `non-event row ${i} must keep the audio header`);
			assert.match(frame, /Audio notifications/, `non-event row ${i} must stay on the audio card`);
			assert.doesNotMatch(frame, /Visual profiles/, `non-event row ${i} must not open the profile pane`);
			assert.equal(h.played, 0, `non-event row ${i} must not autoplay audio`);
			if (i < nonEvent.length - 1) view.handleInput("\x1b[B");
		}
		assert.deepEqual(listed, [], "the profile catalog must never be listed from Notifications controls");
	} finally { h.owner.retire(); }
});
