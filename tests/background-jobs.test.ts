import assert from "node:assert/strict";
import test from "node:test";
import { compileJobMatch, createJobWatch, filterOutputLines, TAIL_LINES } from "../lib/background-jobs.ts";

// The watch is the pure condition core of background jobs: it sees output
// chunks and clock values and decides when the parent must be woken. It owns
// no timers, processes, or I/O.

test("match fires once on the first complete matching line, never on a partial line", () => {
	const watch = createJobWatch({ match: /listening on :(\d+)/ }, 0);
	assert.deepEqual(watch.push("booting\nlisten", 1), []);
	assert.deepEqual(watch.push("ing on :3000\nlistening on :4000\n", 2), [{ kind: "match", line: "listening on :3000" }]);
	assert.deepEqual(watch.push("listening on :5000\n", 3), []);
});

test("a trailing partial line counts as complete when the job ends", () => {
	const watch = createJobWatch({ match: /done/ }, 0);
	assert.deepEqual(watch.push("all done", 1), []);
	assert.deepEqual(watch.end(), [{ kind: "match", line: "all done" }]);
	assert.deepEqual(watch.tail(), ["all done"]);
});

test("CRLF line endings do not leak a carriage return into lines", () => {
	const watch = createJobWatch({ match: /^ok$/ }, 0);
	assert.deepEqual(watch.push("ok\r\n", 1), [{ kind: "match", line: "ok" }]);
	assert.deepEqual(watch.tail(), ["ok"]);
});

test("silence fires once when no output arrives for silenceMs, and any output renews it", () => {
	const watch = createJobWatch({ silenceMs: 1000 }, 0);
	assert.equal(watch.silenceDeadline(), 1000);
	assert.deepEqual(watch.checkSilence(999), []);
	watch.push("tick\n", 500);
	assert.equal(watch.silenceDeadline(), 1500);
	assert.deepEqual(watch.checkSilence(1000), []);
	assert.deepEqual(watch.checkSilence(1500), [{ kind: "silence", silentMs: 1000 }]);
	assert.equal(watch.silenceDeadline(), undefined);
	assert.deepEqual(watch.checkSilence(5000), []);
});

test("without conditions the watch never fires and has no silence deadline", () => {
	const watch = createJobWatch({}, 0);
	assert.deepEqual(watch.push("anything\n", 1), []);
	assert.equal(watch.silenceDeadline(), undefined);
	assert.deepEqual(watch.checkSilence(10 ** 9), []);
	assert.deepEqual(watch.end(), []);
});

test("tail keeps only the last TAIL_LINES complete lines", () => {
	const watch = createJobWatch({}, 0);
	const lines = Array.from({ length: TAIL_LINES + 5 }, (_, i) => `line ${i}`);
	watch.push(`${lines.join("\n")}\n`, 1);
	assert.deepEqual(watch.tail(), lines.slice(5));
});

test("compileJobMatch drops stateful g/y flags and rejects invalid patterns", () => {
	const regex = compileJobMatch("ERROR", "gi");
	assert.equal(regex.flags, "i");
	assert.ok(regex.test("error") && regex.test("error"));
	assert.throws(() => compileJobMatch("(", undefined), /Invalid match pattern/);
	assert.throws(() => compileJobMatch("x", "z"), /Invalid match pattern/);
});

test("filterOutputLines keeps matching lines and passes text through without a filter", () => {
	assert.equal(filterOutputLines("a\nerr 1\nb\nerr 2\n", /err/), "err 1\nerr 2\n");
	assert.equal(filterOutputLines("a\nb", undefined), "a\nb");
	assert.equal(filterOutputLines("a\nb", /zzz/), "");
});
