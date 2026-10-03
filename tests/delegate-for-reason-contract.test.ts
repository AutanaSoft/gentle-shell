import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const verification = read("assets/orchestrator-verification.md");
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

// T3 (S5-S7, AC5): the parallel review protocol lives in the lazy verification
// module, so it loads only when delegation happens.
function sectionFrom(text: string, heading: string): string {
	const start = text.indexOf(heading);
	assert.ok(start >= 0, `missing section: ${heading}`);
	const next = text.indexOf("\n## ", start + heading.length);
	return text.slice(start, next < 0 ? undefined : next + 1);
}

const reviewSection = (): string => sectionFrom(verification, "## Parallel review protocol (gentle-shell#1731)");

function reviewItem(prefix: string): string {
	return lineStarting(reviewSection(), prefix);
}

test("AC5/S5: every worker self-reviews against the spec by reference before returning", () => {
	const item = reviewItem("1. **Self-review**");
	for (const clause of [
		"in its own session before returning",
		"spec sections by reference (#1713)",
		"the request's authorized examples, tests, and typecheck",
		"fixes and continues",
		"requirement by requirement",
		"Low and medium risk need nothing else.",
	]) {
		assert.ok(item.includes(clause), `self-review item is missing: ${clause}`);
	}
	assert.ok(writer.includes("Parallel review protocol") && writer.includes("`orchestrator-verification.md`"), "the writer module must point at the review protocol");
});

test("AC5/S6/L4: per-worker independent verify fires only on assess or escalate, never on the summary alone", () => {
	const item = reviewItem("2. **Independent verify per unit**");
	for (const clause of [
		"in parallel when several finish together",
		"only when that unit is high risk",
		"`assess` over its actual diff",
		"the worker's own `escalate`",
		"never inferred from the worker's summary alone",
		'its work-unit commit (`{"baseRef":"<previous>","committedOnly":true}`)',
		"its own isolated worktree",
	]) {
		assert.ok(item.includes(clause), `independent verify item is missing: ${clause}`);
	}
	assert.ok(!reviewSection().includes("(1) data or irreversible effects"), "the protocol restates the high-risk list instead of referencing it");
	assert.ok(item.includes("high-risk list in Task Size"), "the protocol must reference the core high-risk list");
});

test("AC5/S7: one inline full-suite seam check after parallel units", () => {
	const item = reviewItem("3. **Seam check**");
	for (const clause of ["after parallel units finish", "one inline full-suite command", "parent spot check", "seams between units"]) {
		assert.ok(item.includes(clause), `seam check item is missing: ${clause}`);
	}
});

test("AC4/S4: the normative verification rule text is unchanged by the review protocol", () => {
	const normative = sectionFrom(verification, "## Verification rule (normative)");
	assert.equal(
		createHash("sha256").update(normative).digest("hex"),
		"decd9979faa4f6329df9b8fec16d69230428f14d116edff136f1bee2f540a888",
		"the normative Verification rule section changed",
	);
	assert.ok(verification.includes("or a delegated writer returns"), "the module must still load when a delegated writer returns");
});

test("S1: the small path stays inline and no lazy surface keeps the size-based writer route", () => {
	assert.ok(core.includes("No explore, worker, or verifier"), "small path must stay inline");
	assert.ok(!delegation.includes("| Write a large (tracked) task | — | ✅ one writer per task |"), "delegation table keeps the size-based writer row");
	assert.ok(delegation.includes("| Write a large task with no Writer rule reason | ✅ following the logbook | — |"), "delegation table must route a reasonless large task inline");
	assert.ok(!delegation.includes("implementing a large tracked task (writer)"), "Simple Delegation keeps the size-based writer route");
});

// T4 (S2, AC6): the runtime rejects an overlapping live writer at admission,
// so the single-writer wording relaxes to disjoint surfaces or isolated worktrees.
test("AC6: parallel writers need disjoint Allowed edit surfaces (runtime-enforced) or isolated worktrees", () => {
	const rule = "arallel writers only with disjoint Allowed edit surfaces (runtime-enforced) or isolated worktrees";
	const harness = read("extensions/gentle-ai.ts");
	const docs = read("docs/readme-reference.md");
	assert.ok(core.includes(`- P${rule}.`), "core Safety must carry the relaxed writer rule");
	assert.ok(harness.includes(`- P${rule}.`), "harness principles must carry the relaxed writer rule");
	for (const [path, text] of Object.entries({ core, delegation, harness, skill, docs })) {
		assert.ok(text.includes(rule), `${path} is missing the relaxed writer rule`);
		for (const retired of ["single-threaded", "Never run parallel writers in one worktree", "do not run parallel writers unless isolated worktrees", "preserves a single writer thread", "one writer per task"]) {
			assert.ok(!text.includes(retired), `${path} keeps the single-writer wording: ${retired}`);
		}
	}
});
