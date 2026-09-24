import assert from "node:assert/strict";
import { test } from "node:test";
import { VisualCustomizeView } from "../lib/visual-customize-view.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import { getThemeByName, Theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";

const theme = { fg: (_role: string, text: string) => text };

test("profiles open without applying settings", () => {
	const view = new VisualCustomizeView({ rows: [], profiles: { list: () => [], save: () => {}, apply: () => {}, delete: () => {}, reset: () => {} }, theme, requestRender: () => {}, onClose: () => {} });
	view.handleInput("p");
	assert.match(view.render(80).join("\n"), /Visual profiles/);
});

test("profile confirmation rejects a changed target and a hidden prompt after resize", () => {
	const first = { name: "one", themeName: "dark", animationPolicy: "quality" as const, banner: { showRose: true, showTextLogo: false, color: "pink" as const }, visual: { statusPlacement: "auto" as const, headerPlacement: "top" as const, density: "comfortable" as const, visibility: { changes: true, agents: true, todo: true, usageCost: true, modelDetails: true } } };
	let items = [first];
	let height = 12;
	const applied: string[] = [];
	const view = new VisualCustomizeView({ rows: [], profiles: { list: () => items, save: () => {}, apply: name => { applied.push(name); }, delete: () => {}, reset: () => {} }, theme, rowsAvailable: () => height, requestRender: () => {}, onClose: () => {} });
	view.handleInput("p");
	view.render(80);
	view.handleInput("a");
	view.render(80);
	items = [{ ...first, themeName: "light" }];
	view.handleInput("y");
	assert.deepEqual(applied, []);
	view.handleInput("a");
	view.render(80);
	height = 2;
	view.handleInput("y");
	assert.deepEqual(applied, []);
});

test("a hidden confirmation after a zero-width render cannot be confirmed by a stray 'y'", () => {
	const items = [{ name: "one", themeName: "dark", animationPolicy: "quality" as const, banner: { showRose: true, showTextLogo: false, color: "pink" as const }, visual: { statusPlacement: "auto" as const, headerPlacement: "top" as const, density: "comfortable" as const, visibility: { changes: true, agents: true, todo: true, usageCost: true, modelDetails: true } } }];
	const deleted: string[] = [];
	const view = new VisualCustomizeView({ rows: [], profiles: { list: () => items, save: () => {}, apply: () => {}, delete: name => { deleted.push(name); }, reset: () => {} }, theme, rowsAvailable: () => 12, requestRender: () => {}, onClose: () => {} });
	view.handleInput("p");
	view.render(80);
	view.handleInput("d");
	assert.match(view.render(80).join("\n"), /Confirm delete one/);
	assert.deepEqual(view.render(0), [], "a zero-width frame renders nothing");
	view.handleInput("y");
	assert.deepEqual(deleted, [], "a confirmation invisible in the last rendered frame must not be confirmable");
});

test("an input typed before a zero-width render cannot be saved by a stray Enter", () => {
	const items: never[] = [];
	const saved: Array<[string, boolean]> = [];
	const view = new VisualCustomizeView({ rows: [], profiles: { list: () => items, save: (name, replace) => { saved.push([name, replace]); }, apply: () => {}, delete: () => {}, reset: () => {} }, theme, rowsAvailable: () => 12, requestRender: () => {}, onClose: () => {} });
	view.handleInput("p");
	view.render(80);
	view.handleInput("s");
	view.handleInput("a");
	view.handleInput("b");
	view.handleInput("c");
	assert.match(view.render(80).join("\n"), /New profile name: abc/);
	assert.deepEqual(view.render(0), [], "a zero-width frame renders nothing");
	view.handleInput("\r");
	assert.deepEqual(saved, [], "an input invisible in the last rendered frame must not be saveable");
});

test("customization view renders with Pi's real Theme instance", () => {
	const piTheme = getThemeByName("dark");
	assert.ok(piTheme instanceof Theme);
	const view = new VisualCustomizeView({ rows: [{ label: "Theme: dark", action: () => {} }], theme: piTheme, requestRender: () => {}, onClose: () => {} });
	assert.match(view.render(80).join("\n"), /Theme: dark/);
});

test("customization view navigates, activates and closes on Escape", () => {
	const actions: string[] = [];
	let closed = 0;
	const view = new VisualCustomizeView({ rows: [{ label: "Rose: on", action: () => { actions.push("rose"); } }, { label: "Reset defaults", action: () => { actions.push("reset"); } }], theme, requestRender: () => {}, onClose: () => { closed++; } });
	assert.match(view.render(40).join("\n"), /Rose: on/);
	view.handleInput("\x1b[B");
	view.handleInput("\r");
	assert.deepEqual(actions, ["reset"]);
	view.handleInput("\x1b");
	assert.equal(closed, 1);
});

test("view handles empty rows, narrow and zero widths without invalid selection", () => {
	const view = new VisualCustomizeView({ rows: [], theme, rowsAvailable: () => 8, requestRender: () => {}, onClose: () => {} });
	view.handleInput("\x1b[A");
	view.handleInput("\x1b[B");
	view.handleInput("\r");
	assert.match(view.render(30).join("\n"), /No settings available/);
	for (const width of [0, 1, 4]) assert.ok(view.render(width).every((line) => visibleWidth(line) <= Math.max(0, width)));
});

test("tiny terminal heights never display settings beyond available rows", () => {
	let height = 0;
	const view = new VisualCustomizeView({ rows: [{ label: "Secret setting", action: () => {} }], theme, rowsAvailable: () => height, requestRender: () => {}, onClose: () => {} });
	assert.deepEqual(view.render(40), []);
	height = 1;
	assert.equal(view.render(40).length, 1);
	assert.doesNotMatch(view.render(40).join("\n"), /Secret setting/);
	height = 2;
	assert.equal(view.render(40).length, 2);
	assert.doesNotMatch(view.render(40).join("\n"), /Secret setting/);
	view.handleInput("\r");
	view.handleInput("\x1b");
});

test("highlight previews the installed source without applying; Enter explicitly applies", () => {
	let applies = 0;
	const view = new VisualCustomizeView({ rows: [
		{ label: "Animations: quality", action: () => {} },
		{ label: "Theme: dusk", preview: () => ({ title: "dusk · source palette", sample: "Aa sample text" }), action: () => { applies++; } },
	], theme, rowsAvailable: () => 12, requestRender: () => {}, onClose: () => {} });
	view.handleInput("\x1b[B");
	assert.match(view.render(80).join("\n"), /dusk · source palette.*\n.*Aa sample text/);
	assert.equal(applies, 0);
	view.handleInput("\r");
	assert.equal(applies, 1);
});

test("unreadable source never substitutes active colors or activates", () => {
	const view = new VisualCustomizeView({ rows: [{ label: "Theme: broken", preview: () => { throw new Error("unreadable"); }, action: () => {} }], theme, rowsAvailable: () => 12, requestRender: () => {}, onClose: () => {} });
	assert.match(view.render(80).join("\n"), /Preview unavailable/);
});

test("view awaits async actions, reports errors and repaints after completion", async () => {
	let release!: () => void;
	let renders = 0;
	const errors: string[] = [];
	const view = new VisualCustomizeView({ rows: [{ label: "Save", action: () => new Promise<void>((_resolve, reject) => { release = () => reject(new Error("write failed")); }) }], theme, requestRender: () => { renders++; }, onError: (error) => { errors.push(error.message); }, onClose: () => {} });
	view.handleInput("\r");
	view.handleInput("\r");
	release();
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.deepEqual(errors, ["write failed"]);
	assert.ok(renders >= 2);
});
