import assert from "node:assert/strict";
import { test } from "node:test";
import { VisualCustomizeView } from "../lib/visual-customize-view.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import { getThemeByName, Theme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";

const theme = { fg: (_role: string, text: string) => text };

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
