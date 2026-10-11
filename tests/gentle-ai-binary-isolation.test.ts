import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bundledGentleAiPaths, gentleAiIsolationEnv } from "../lib/gentle-ai-binary.ts";
import { engramPinVersion } from "../scripts/installer-downloads.mjs";

// S9: gentle-pi's own gentle-ai runs in a bundled install keep Gentle AI's
// state, persona and Engram inside the prefix. Only this package inside the
// prefix's versions/ honors the launcher's GENTLE_SHELL_PREFIX.

function bundledPrefix(t: test.TestContext) {
	const prefix = realpathSync(mkdtempSync(join(tmpdir(), "gentle-ai-isolation-")));
	t.after(() => rmSync(prefix, { recursive: true, force: true }));
	const packageRoot = join(prefix, "versions", "4.1.0-1.1.0", "node_modules", "gentle-pi");
	mkdirSync(packageRoot, { recursive: true });
	const engram = join(prefix, "runtime", `engram-${engramPinVersion}`, process.platform === "win32" ? "engram.exe" : "engram");
	mkdirSync(join(engram, ".."), { recursive: true });
	writeFileSync(engram, "engram", { mode: 0o700 });
	return { prefix, packageRoot, engram };
}

test("bundledGentleAiPaths names the prefix's Gentle AI home, gentle-pi config folder and pinned Engram", () => {
	assert.deepEqual(bundledGentleAiPaths("/home/ana/.gentle-shell", "linux"), {
		home: "/home/ana/.gentle-shell/gentle-ai",
		piConfig: "/home/ana/.gentle-shell/gentle-pi",
		engram: `/home/ana/.gentle-shell/runtime/engram-${engramPinVersion}/engram`,
	});
	assert.equal(bundledGentleAiPaths("C:\\Users\\Ana\\AppData\\Local\\gentle-shell", "win32").engram,
		`C:\\Users\\Ana\\AppData\\Local\\gentle-shell\\runtime\\engram-${engramPinVersion}\\engram.exe`);
});

test("gentleAiIsolationEnv adds the four Gentle AI variables for this package inside a bundled prefix", (t) => {
	const { prefix, packageRoot, engram } = bundledPrefix(t);
	const base = { PATH: "/usr/bin", GENTLE_SHELL_PREFIX: prefix };
	const env = gentleAiIsolationEnv(base, { packageRoot });
	assert.deepEqual(env, {
		...base,
		GENTLE_AI_HOME: join(prefix, "gentle-ai"),
		GENTLE_AI_PI_CONFIG_DIR: join(prefix, "gentle-pi"),
		GENTLE_AI_ENGRAM_BIN: engram,
		GENTLE_AI_NO_SELF_UPDATE: "1",
	});
	assert.equal("GENTLE_AI_HOME" in base, false, "the caller's environment is not changed");
	// Without the published Engram, Gentle AI gets no Engram to use.
	rmSync(engram);
	assert.equal("GENTLE_AI_ENGRAM_BIN" in gentleAiIsolationEnv(base, { packageRoot }), false);
});

test("gentleAiIsolationEnv returns the environment unchanged outside a bundled install", (t) => {
	const { prefix, packageRoot } = bundledPrefix(t);
	const unchanged = (env: NodeJS.ProcessEnv, root = packageRoot) => assert.equal(gentleAiIsolationEnv(env, { packageRoot: root }), env);
	unchanged({ PATH: "/usr/bin" });
	unchanged({ GENTLE_SHELL_PREFIX: "" });
	unchanged({ GENTLE_SHELL_PREFIX: "relative/prefix" });
	unchanged({ GENTLE_SHELL_PREFIX: join(prefix, "missing") });
	// A gentle-pi outside the prefix's versions (the user's own, run from the
	// agent's shell, which inherits GENTLE_SHELL_PREFIX) keeps its own Gentle AI.
	const outside = join(prefix, "elsewhere", "gentle-pi");
	mkdirSync(outside, { recursive: true });
	unchanged({ GENTLE_SHELL_PREFIX: prefix }, outside);
	unchanged({ GENTLE_SHELL_PREFIX: prefix }, join(prefix, "versions"));
});
