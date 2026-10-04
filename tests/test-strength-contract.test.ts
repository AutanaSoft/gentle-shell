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
