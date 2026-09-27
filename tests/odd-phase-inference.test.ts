import assert from "node:assert/strict";
import test from "node:test";
import { inferOddPhase } from "../lib/odd-phase-inference.ts";

// Deterministic, conservative tool -> ODD phase mapping for the Gentle Shell
// working label. Unknown tools and ambiguous shell commands never change it.

test("read-only file tools infer exploring", () => {
	for (const tool of ["read", "grep", "find", "ls", "codegraph"]) {
		assert.equal(inferOddPhase(tool, { path: "src/index.ts" }), "exploring", tool);
	}
});

test("asking the user infers deciding", () => {
	assert.equal(inferOddPhase("ask_user_choice", {}), "deciding");
	assert.equal(inferOddPhase("ask_user_question", {}), "deciding");
});

test("todo and edits to ODD feature documents infer planning", () => {
	assert.equal(inferOddPhase("todo", { items: [] }), "planning");
	assert.equal(inferOddPhase("write", { path: "odd/tasks/feature.md" }), "planning");
	assert.equal(inferOddPhase("edit", { path: "/repo/odd/tasks/feature.md" }), "planning");
	assert.equal(inferOddPhase("edit", { path: "C:\\repo\\odd\\tasks\\feature.md" }), "planning");
});

test("edits and writes to other paths infer implementing", () => {
	assert.equal(inferOddPhase("edit", { path: "lib/odd-phase.ts" }), "implementing");
	assert.equal(inferOddPhase("write", { path: "tests/new.test.ts" }), "implementing");
	assert.equal(inferOddPhase("write", {}), "implementing", "a write without a readable path is still a write");
	assert.equal(inferOddPhase("edit", undefined), "implementing");
});

test("native review tools infer checking", () => {
	for (const tool of ["gentle_review", "gentle_review_scope", "gentle_review_capture", "gentle_review_capture_group"]) {
		assert.equal(inferOddPhase(tool, {}), "checking", tool);
	}
});

test("shell test, typecheck, lint, and build commands infer checking", () => {
	for (const command of [
		"pnpm test",
		"npm test",
		"npm run test -- --watch=false",
		"node --experimental-strip-types --test tests/odd-phase.test.ts",
		"npx vitest run",
		"jest --ci",
		"go test ./...",
		"cargo test",
		"python -m pytest -q",
		"pytest tests/",
		"tsc --noEmit",
		"pnpm typecheck",
		"node scripts/check-types.mjs",
		"pnpm lint",
		"eslint .",
		"npm run build",
		"go build ./...",
		"make",
		"cd sub && make check",
	]) {
		assert.equal(inferOddPhase("bash", { command }), "checking", command);
	}
	assert.equal(inferOddPhase("powershell", { command: "npm test" }), "checking");
});

test("read-only shell inspection infers exploring", () => {
	for (const command of [
		"git status",
		"git log --oneline -5",
		"git diff --stat",
		"git show HEAD",
		"git branch -a",
		"ls -la",
		"cat package.json",
		"head -20 README.md",
		"tail -n 5 log.txt",
		"grep -rn foo lib",
		"rg oddPhase",
		"find . -name '*.ts'",
		"wc -l lib/odd-phase.ts",
		"pwd",
	]) {
		assert.equal(inferOddPhase("bash", { command }), "exploring", command);
	}
});

test("a checking segment wins over an exploring segment in the same command", () => {
	assert.equal(inferOddPhase("bash", { command: "git status && pnpm test" }), "checking");
	assert.equal(inferOddPhase("bash", { command: "pnpm test | tail -20" }), "checking");
});

test("ambiguous or mutating shell commands leave the label unchanged", () => {
	for (const command of [
		"git commit -m 'feat: x'",
		"git push",
		"rm -rf dist",
		"echo hello",
		"pnpm install",
		"curl https://example.com",
		"ls && rm -rf dist",
		"",
	]) {
		assert.equal(inferOddPhase("bash", { command }), undefined, command);
	}
	assert.equal(inferOddPhase("bash", {}), undefined);
	assert.equal(inferOddPhase("bash", { command: 42 }), undefined);
	assert.equal(inferOddPhase("bash", undefined), undefined);
});

test("subagent and unknown tools leave the label unchanged", () => {
	for (const tool of ["subagent_start", "subagent_wait", "gentle_odd_phase", "mem_save", "web_fetch", ""]) {
		assert.equal(inferOddPhase(tool, {}), undefined, tool);
	}
});

test("MCP-prefixed tool names are normalized before mapping", () => {
	assert.equal(inferOddPhase("mcp__custom-tools__read", { path: "a.ts" }), "exploring");
	assert.equal(inferOddPhase("mcp__custom-tools__edit", { path: "a.ts" }), "implementing");
	assert.equal(inferOddPhase("mcp__custom-tools__write", { path: "odd/tasks/f.md" }), "planning");
	assert.equal(inferOddPhase("mcp__custom-tools__bash", { command: "pnpm test" }), "checking");
	assert.equal(inferOddPhase("mcp__custom-tools__mem_save", {}), undefined);
});
