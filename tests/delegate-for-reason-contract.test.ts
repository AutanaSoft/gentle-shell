import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readDelegationDetail } from "./support/orchestrator-modules.ts";

// gentle-shell#1731: the delegated writer fires on named reasons (parallelism,
// model routing, context), never on task size. A large task keeps the ODD
// logbook (#1494 resume test) and works inline when no reason fires. The
// model-routing reason is fact-gated: it fires only when the harness reports a
// price ratio, so agents without prices keep the #1494 inline path.
// These are instruction-delivery contracts, not proof of model adherence.

const read = (relative: string): string => readFileSync(join(import.meta.dirname, "..", relative), "utf8");
const core = read("assets/orchestrator.md");
const delegation = readDelegationDetail();
const writer = read("assets/orchestrator-writer.md");
const skill = read("skills/gentle-ai/SKILL.md");

function lineStarting(text: string, prefix: string): string {
	const line = text.split("\n").find((entry) => entry.startsWith(prefix));
	assert.ok(line, `missing line starting with: ${prefix}`);
	return line;
}

const coreWriter = lineStarting(core, "5. **Writer rule**");
const delegationWriter = lineStarting(delegation, "5. **Writer trigger (Writer rule):**");

test("AC1: the core writer rule fires on named reasons, never on size or file count", () => {
	for (const clause of [
		"never by file count or a large task alone",
		"`orchestrator-writer.md`",
		"2+ independent units, disjoint files, each heavier than a subagent start",
		"reported Model routing ratio ~3x+",
		"Context backstop",
	]) {
		assert.ok(coreWriter.includes(clause), `core Writer rule is missing: ${clause}`);
	}
	assert.ok(!core.includes("large task → one bounded `gentle-ai-worker` per task"), "core keeps the size-based writer rule");
	assert.ok(
		core.includes("large tasks get ODD tracking and workers only by the Writer rule, else inline"),
		"core Task Size must keep tracking for large tasks and run them inline without a writer reason",
	);
});

test("AC1: the lazy writer trigger names its reasons and keeps the logbook on the inline path", () => {
	for (const clause of [
		"a large task alone never delegates, and file count never fires this trigger",
		"Delegate one bounded writer per unit only for a named reason",
		"(a) parallelism",
		"(b) model routing",
		"(c) context",
		"Without a reason, the parent works inline, following the logbook (feature document, mirror, `todo`, work-unit commits)",
	]) {
		assert.ok(delegationWriter.includes(clause), `lazy Writer trigger is missing: ${clause}`);
	}
	for (const [path, text] of Object.entries({ delegation, writer, skill })) {
		assert.ok(!text.includes("a large task delegates one bounded writer per task"), `${path} keeps the size-based writer trigger`);
		assert.ok(!text.includes("one writer per task"), `${path} keeps one writer per task`);
		assert.ok(!text.includes("a large task (track and writer)"), `${path} still fires the writer on size`);
	}
	assert.ok(writer.includes("never on size alone"), "the writer module must say the Writer rule never fires on size alone");
	assert.ok(skill.includes("a writer reason (parallel units, a reported price ratio of about 3x or more, or context)"), "the skill must name the writer reasons");
});

test("AC2: parallelism needs 2+ independent units, disjoint files, each heavier than a subagent start", () => {
	assert.ok(
		delegationWriter.includes(
			"(a) parallelism — 2+ independent units with disjoint files, each clearly heavier than starting a subagent; medium tasks included",
		),
		"lazy Writer trigger must state the parallelism threshold",
	);
	assert.ok(writer.includes("parallel units"), "the writer module must name the parallelism reason");
});

test("S3/L8: the model-routing reason is fact-gated with a safe default", () => {
	assert.ok(
		delegationWriter.includes(
			"(b) model routing — the harness reports a `Model routing:` price ratio of about 3x or more: delegate implementation of anything beyond a trivial single edit; when no ratio is reported, or it is unknown, this reason does not fire",
		),
		"lazy Writer trigger must gate the cost reason on a reported ratio",
	);
	assert.ok(coreWriter.includes("a reported Model routing ratio ~3x+ (unknown: no), beyond one trivial edit"), "core Writer rule must not fire on cost without a reported ratio");
	// The fact line itself lives only in the harness section (T1).
	assert.ok(!core.includes("Model routing:"), "the orchestrator core never carries the fact line");
});

test("AC4: verification stays risk-gated and the writer reasons never include risk", () => {
	assert.ok(
		core.includes(
			"3. **Verification rule** — high risk → independent `gentle-ai-verify` after the change's own checks (`orchestrator-verification.md`); otherwise checks run inline.",
		),
		"core Verification rule changed",
	);
	assert.ok(
		delegation.includes(
			"3. **Verification rule** (gentle-pi#661/#662, RDD-aware): a high-risk change (Task Size) gets an independent `gentle-ai-verify` run after the change's own checks; otherwise whoever made the change runs its focused test and suite inline, small tasks included.",
		),
		"lazy Verification rule changed",
	);
	for (const [label, text] of Object.entries({ coreWriter, delegationWriter })) {
		assert.ok(!/high risk|high-risk|verify/i.test(text), `${label} mixes risk or verification into the writer reasons`);
	}
	assert.ok(!writer.includes("(1) data or irreversible effects"), "the writer module restates the high-risk list");
});

test("S1: the small path stays inline and no lazy surface keeps the size-based writer route", () => {
	assert.ok(core.includes("No explore, worker, or verifier"), "small path must stay inline");
	assert.ok(!delegation.includes("| Write a large (tracked) task | — | ✅ one writer per task |"), "delegation table keeps the size-based writer row");
	assert.ok(delegation.includes("| Write a large task with no Writer rule reason | ✅ following the logbook | — |"), "delegation table must route a reasonless large task inline");
	assert.ok(!delegation.includes("implementing a large tracked task (writer)"), "Simple Delegation keeps the size-based writer route");
});
