import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";

// gentle-shell#1494: task size is decided by understanding, risk, and whether
// the work can be resumed from the diff, never by counting files, commands,
// fixes, or a requested todo list. Each mechanism (ask, explore, verify,
// track, writer) turns on only by its own trigger.

const REPO_ROOT = join(import.meta.dirname, "..");
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), "utf8");

const core = read("assets/orchestrator.md");
const delegation = read("assets/orchestrator-delegation.md");
const skill = read("skills/gentle-ai/SKILL.md");
const extension = read("extensions/gentle-ai.ts");

function sectionOf(text: string, heading: string): string {
	const start = text.indexOf(heading);
	assert.ok(start !== -1, `missing section: ${heading}`);
	const next = text.indexOf("\n## ", start + heading.length);
	return next === -1 ? text.slice(start) : text.slice(start, next);
}

test("AC1: the always-on core defines task size once with the three criteria", () => {
	const size = sectionOf(core, "## Task Size");
	for (const clause of [
		"**Understood**",
		"no product or design decision is open",
		"one bounded read batch (at most 3 calls, ~10k tokens",
		"**Contained risk**",
		"**Resumable from the diff**",
		"the original request and `git diff` alone",
		"A task is **large** only when the resume test fails",
	]) {
		assert.ok(size.includes(clause), `task size section is missing: ${clause}`);
	}
	for (const [path, text] of Object.entries({ delegation, skill })) {
		assert.ok(!text.includes("**Resumable from the diff**"), `${path} restates the task-size criteria instead of referencing them`);
		assert.ok(text.includes("Task Size"), `${path} must reference the always-on Task Size section`);
	}
});

test("AC2: counts never classify, and the step-count classifier is gone", () => {
	const size = sectionOf(core, "## Task Size");
	assert.ok(
		size.includes("The number of files, commands or tests, fixes, or a requested `todo` list never decides size"),
		"task size must say counts never classify",
	);
	for (const [path, text] of Object.entries({ core, delegation, skill, extension, readme: read("docs/readme-reference.md") })) {
		assert.ok(!text.includes("two or more meaningful implementation steps"), `${path} keeps the step-count classifier`);
	}
	const prompt = __testing.buildGentlePrompt("gentleman");
	const classify = prompt.slice(prompt.indexOf("4. **Classify.**"), prompt.indexOf("5. **Track before the first write.**"));
	assert.ok(classify.includes("Task Size"), "ODD step 4 must classify by the Task Size section");
});

test("AC3: small work runs its checks inline and keeps test-first", () => {
	const size = sectionOf(core, "## Task Size");
	for (const clause of [
		"run the focused test and the suite inline, once each",
		"observe RED inline before the fix",
		"No explore, worker, or verifier",
		"no feature document, mirror, or commits unless the user asks",
		"needs no lazy asset",
	]) {
		assert.ok(size.includes(clause), `small path is missing: ${clause}`);
	}
	for (const [path, text] of Object.entries({ core, delegation, skill })) {
		assert.ok(!text.includes("only a read-only check within the evidence budget stays inline"), `${path} keeps the read-only-only inline check`);
		assert.ok(!text.includes("Only a truly local read-only check within the evidence budget stays inline"), `${path} keeps the read-only-only inline check`);
		assert.ok(!text.includes("running focused tests/builds"), `${path} still delegates focused test runs`);
		assert.ok(!text.includes("command-running verification → `gentle-ai-verify`"), `${path} still routes every command-running check to a verifier`);
	}
});

test("AC4: each mechanism turns on only by its own trigger and size is re-evaluated after", () => {
	const triggers = sectionOf(core, "## Mechanisms");
	for (const clause of [
		"each mechanism turns on only by its own trigger",
		"re-evaluate task size",
		"1. **Ask**",
		"2. **Evidence-budget rule**",
		"3. **Verification rule**",
		"4. **Track**",
		"5. **Writer rule**",
		"6. **Incident rule**",
		"7. **Context backstop**",
		"open product or design decision",
		"high risk",
		"never by file count",
	]) {
		assert.ok(triggers.includes(clause), `mechanism list is missing: ${clause}`);
	}
	for (const [path, text] of Object.entries({ core, delegation, skill })) {
		assert.ok(!/2\+ non-trivial files|2 or more non-trivial files|Multi-file write rule/.test(text), `${path} keeps the file-count writer trigger`);
	}
});

test("AC5: the high-risk list lives once in the core, native tier wins, unclear is bounded", () => {
	const size = sectionOf(core, "## Task Size");
	for (const clause of [
		"**High risk**",
		"hard to detect, hard to undo, or reaches beyond the change",
		"(1) data or irreversible effects",
		"(2) security",
		"(3) contracts others consume",
		"(4) concurrency",
		"(5) delivery or environment",
		"(6) no test would catch a regression",
		"only when a bounded look cannot tell whether (1)-(5) apply",
		"native assess returns a tier, that tier wins",
	]) {
		assert.ok(size.includes(clause), `high-risk definition is missing: ${clause}`);
	}
	for (const [path, text] of Object.entries({ delegation, skill })) {
		assert.ok(!text.includes("(1) data or irreversible effects"), `${path} restates the high-risk list`);
	}
});
