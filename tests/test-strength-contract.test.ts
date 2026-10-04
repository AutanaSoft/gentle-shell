import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";

// gentle-shell#1731 T26 (L54): in the final bench blind review of x2, the
// Gentle Shell inline solutions ranked below Codex on tests: they skipped the
// empty-stdout check, put the bad row last (no proof that later valid rows are
// not saved), missed the empty value, and asserted internal storage instead of
// the public output. The verify-backed arm ranked first because verify's probe
// checklist covers exactly these. Writers and inline work get the same
// checklist for the tests they write. Instruction-delivery contract only.

const TEST_RULE = [
	"Each test asserts every observable effect of the rule it covers",
	"exit code, exact stdout and stderr",
	"rejected input leaves stored data and counters unchanged",
	"empty, zero, and malformed values",
	"a valid item after the invalid one",
	"through the public interface, never internal storage",
];

const read = (relative: string): string => readFileSync(join(import.meta.dirname, "..", relative), "utf8");

test("T26: the always-on Implement step gives inline work the test checklist", () => {
	for (const persona of ["gentleman", "neutral"] as const) {
		const step = __testing.buildGentlePrompt(persona).split("\n").find((line) => line.startsWith("6. **Implement"));
		assert.ok(step, "ODD step 6 Implement is missing");
		for (const clause of TEST_RULE) assert.ok(step.includes(clause), `${persona} Implement step is missing: ${clause}`);
	}
});

test("T26: the worker test discipline carries the same checklist", () => {
	const worker = read("assets/agents/gentle-ai-worker.md");
	for (const clause of TEST_RULE) assert.ok(worker.includes(clause), `worker test discipline is missing: ${clause}`);
	assert.ok(!worker.includes("add the smallest behavior-level test"), "RED must not ask for the smallest test");
});

// T26b (L56): blind review of x5 ranked Codex above the inline Gentle Shell
// arms partly because they added options without updating help and README.
test("T26b: inline and delegated work update the help and docs that describe a changed option", () => {
	const clause = "When you add or change a command, option, or message, update the help text and docs that describe it";
	for (const persona of ["gentleman", "neutral"] as const) {
		const step = __testing.buildGentlePrompt(persona).split("\n").find((line) => line.startsWith("6. **Implement"));
		assert.ok(step?.includes(clause), `${persona} Implement step is missing the docs rule`);
	}
	assert.ok(read("assets/agents/gentle-ai-worker.md").includes(clause), "worker is missing the docs rule");
});

// T27 (L56): in `pi --mode json` the runtime already rejects background
// launches (T18), but the prompt still said "Background subagent policy: on",
// so B-bg tried background twice and took the parallel-writer path; its worker
// shipped the silent `budget set --year` defect. Single-shot hosts render off.
test("T27: single-shot host modes render the background policy as off", () => {
	for (const mode of ["json", "print"]) {
		const prompt = __testing.buildGentlePrompt("gentleman", process.cwd(), undefined, undefined, mode);
		assert.match(prompt, /Background subagent policy: off \(single-shot mode\)/, `${mode} must render off`);
	}
	for (const mode of ["tui", "rpc", undefined]) {
		const prompt = __testing.buildGentlePrompt("gentleman", process.cwd(), undefined, undefined, mode);
		assert.doesNotMatch(prompt, /single-shot mode/, `${String(mode)} must keep the configured policy`);
	}
});

// T28 (L58): the user's hypothesis, confirmed in the assets: only the delegated
// worker had a TRIANGULATE step; the inline path (the one arm B uses) said
// "RED, GREEN, then refactor". Both now triangulate with at least two edge
// cases beyond the request's examples after GREEN.
const TRIANGULATE = "TRIANGULATE: add at least two edge cases beyond the request's examples";
test("T28: inline test-first triangulates after GREEN", () => {
	for (const persona of ["gentleman", "neutral"] as const) {
		const prompt = __testing.buildGentlePrompt(persona);
		const principle = prompt.split("\n").find((line) => line.includes("use test-first by default"));
		assert.ok(principle?.includes("observe RED, GREEN, TRIANGULATE, then refactor"), `${persona} principle must triangulate`);
		assert.ok(prompt.includes(TRIANGULATE), `${persona} prompt must define TRIANGULATE`);
		assert.ok(prompt.includes("they need no RED run"), `${persona} TRIANGULATE must not demand a RED run`);
	}
});

test("T28: the worker TRIANGULATE step is concrete", () => {
	const worker = read("assets/agents/gentle-ai-worker.md");
	assert.ok(worker.includes(`3. ${TRIANGULATE}`), "worker TRIANGULATE must ask for two edge cases");
	assert.ok(worker.includes("they need no RED run"), "worker TRIANGULATE must not demand a RED run");
});
