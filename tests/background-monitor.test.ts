import assert from "node:assert/strict";
import test from "node:test";
import {
	createEventBatcher, MONITOR_FLOOD_LINES, MONITOR_FLOOD_WINDOW_MS, MONITOR_LINES_PER_NOTICE, mergeMonitorBatches,
} from "../lib/background-monitor.ts";

// The batcher turns a monitor's stdout lines into bounded notices. It owns no
// timers: the caller flushes MONITOR_BATCH_MS after a line opens a batch.

test("the first line of a batch asks the caller to schedule a flush; later lines join it", () => {
	const batcher = createEventBatcher();
	assert.deepEqual(batcher.pushLine("check lint: pass", 0), { opensBatch: true, flood: false });
	assert.deepEqual(batcher.pushLine("check test: fail", 50), { opensBatch: false, flood: false });
	assert.deepEqual(batcher.flush(), { lines: ["check lint: pass", "check test: fail"], omitted: 0 });
	assert.equal(batcher.flush(), undefined, "an empty batch is never delivered");
	assert.equal(batcher.pushLine("check e2e: pass", 300).opensBatch, true, "after a flush the next line opens a new batch");
	assert.equal(batcher.total(), 3);
});

test("a batch keeps at most MONITOR_LINES_PER_NOTICE lines and counts the rest", () => {
	const batcher = createEventBatcher();
	for (let i = 0; i < MONITOR_LINES_PER_NOTICE + 7; i++) batcher.pushLine(`line ${i}`, i);
	const batch = batcher.flush()!;
	assert.equal(batch.lines.length, MONITOR_LINES_PER_NOTICE);
	assert.equal(batch.lines[0], "line 0");
	assert.equal(batch.omitted, 7);
	assert.equal(batcher.total(), MONITOR_LINES_PER_NOTICE + 7);
});

test("more than MONITOR_FLOOD_LINES lines within the flood window is a flood; a slower stream is not", () => {
	const slow = createEventBatcher();
	const spacing = Math.ceil(MONITOR_FLOOD_WINDOW_MS / MONITOR_FLOOD_LINES) + 1;
	for (let i = 0; i < MONITOR_FLOOD_LINES * 3; i++) assert.equal(slow.pushLine("tick", i * spacing).flood, false);
	const fast = createEventBatcher();
	for (let i = 0; i < MONITOR_FLOOD_LINES; i++) assert.equal(fast.pushLine("spam", i).flood, false);
	assert.equal(fast.pushLine("spam", MONITOR_FLOOD_LINES).flood, true);
});

test("blank lines are not events", () => {
	const batcher = createEventBatcher();
	assert.deepEqual(batcher.pushLine("   ", 0), { opensBatch: false, flood: false });
	assert.equal(batcher.total(), 0);
	assert.equal(batcher.flush(), undefined);
});

test("pending batches for one monitor coalesce within the same line bound", () => {
	assert.deepEqual(mergeMonitorBatches({ lines: ["a", "b"], omitted: 1 }, { lines: ["c"], omitted: 2 }), { lines: ["a", "b", "c"], omitted: 3 });
	const full = { lines: Array.from({ length: MONITOR_LINES_PER_NOTICE }, (_, i) => `x${i}`), omitted: 0 };
	assert.deepEqual(mergeMonitorBatches(full, { lines: ["late", "later"], omitted: 4 }), { lines: full.lines, omitted: 6 });
});
