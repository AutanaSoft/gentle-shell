import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Integration tests for the thin bin/gentle-shell.mjs entry: they run the real
// file via spawnSync with an isolated HOME and a fake pi script standing in for
// the real @earendil-works/pi-coding-agent runtime, so the launcher's own logic
// (already covered at the unit level in tests/gentle-shell-launcher.test.ts)
// gets exercised end-to-end through real argv, env, and child-process wiring.

const binUrl = new URL("../bin/gentle-shell.mjs", import.meta.url);
const binPath = fileURLToPath(binUrl);
const packageRoot = dirname(dirname(binPath));

function fixture(t: test.TestContext) {
	const root = mkdtempSync(join(tmpdir(), "gentle-shell-bin-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "home");
	mkdirSync(home, { recursive: true });
	const piScript = join(root, "fake-pi.mjs");
	writePiScript(piScript, "0.85.1");
	const gentleShellHome = join(root, "gentle-shell-home");
	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: home,
		USERPROFILE: home,
		GENTLE_SHELL_HOME: gentleShellHome,
		GENTLE_SHELL_PI: piScript,
	};
	return { root, home, gentleShellHome, piScript, env };
}

function writePiScript(path: string, version: string) {
	writeFileSync(
		path,
		[
			"#!/usr/bin/env node",
			"const args = process.argv.slice(2);",
			`if (args.includes("--version")) { console.log(${JSON.stringify(version)}); process.exit(0); }`,
			"console.log(JSON.stringify({",
			"  args,",
			"  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,",
			"  GENTLE_PI_AGENT_HOME: process.env.GENTLE_PI_AGENT_HOME,",
			"}));",
			"process.exit(0);",
			"",
		].join("\n"),
	);
	chmodSync(path, 0o755);
}

function run(env: NodeJS.ProcessEnv, args: string[]) {
	return spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8", env });
}

test("--help exits 0 and prints usage", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--help"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Usage: gentle-shell/);
});

test("home with no args prints the default isolated home", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["home"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), `isolated ${f.gentleShellHome}`);
});

test("home link persists and a later home reflects it", (t) => {
	const f = fixture(t);
	const save = run(f.env, ["home", "link"]);
	assert.equal(save.status, 0, save.stderr);
	const configPath = join(f.home, ".gentle-shell", "config.json");
	assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { home: "link" });
	const check = run(f.env, ["home"]);
	assert.equal(check.status, 0, check.stderr);
	assert.match(check.stdout, /^link /);
});

test("home <path> persists a custom directory", (t) => {
	const f = fixture(t);
	const target = join(f.root, "custom-home");
	const save = run(f.env, ["home", target]);
	assert.equal(save.status, 0, save.stderr);
	const configPath = join(f.home, ".gentle-shell", "config.json");
	assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { home: target });
	const check = run(f.env, ["home"]);
	assert.equal(check.stdout.trim(), `path ${target}`);
});

test("first isolated run bootstraps the home, writes fullscreen, and prints the hint once", (t) => {
	const f = fixture(t);
	assert.equal(existsSync(f.gentleShellHome), false);

	const first = run(f.env, []);
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stderr, /using a separate home at/);
	assert.match(first.stderr, /gentle-shell --link/);
	const settings = JSON.parse(readFileSync(join(f.gentleShellHome, "settings.json"), "utf8"));
	assert.equal(settings.tuiMode, "fullscreen");

	const second = run(f.env, []);
	assert.equal(second.status, 0, second.stderr);
	assert.doesNotMatch(second.stderr, /using a separate home at/);
});

test("forwarded args reach pi after the injected extension flags, in order", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--mode", "rpc", "-p", "hi"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"-e",
		packageRoot,
		"--theme",
		join(packageRoot, "themes"),
		"--skill",
		join(packageRoot, "skills"),
		"--prompt-template",
		join(packageRoot, "prompts"),
		"--mode",
		"rpc",
		"-p",
		"hi",
	]);
	assert.equal(payload.GENTLE_PI_AGENT_HOME, f.gentleShellHome);
});

test("--link skips injection and leaves settings.json byte-identical when it already declares gentle-pi", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = '{"packages":["npm:gentle-pi"],"theme":"kept"}';
	writeFileSync(settingsPath, settingsText);
	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };

	const result = run(env, ["--link", "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--mode", "rpc"]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
	assert.equal(payload.PI_CODING_AGENT_DIR, piAgentDir);
	assert.equal(existsSync(join(piAgentDir, ".gentle-shell")), false);
});

test("gentle-shell list forwards to pi as a bare subcommand, with no injected extension flags", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["list"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["list"]);
	assert.equal(payload.PI_CODING_AGENT_DIR, f.gentleShellHome);
});

test("gentle-shell install npm:<pkg> forwards the subcommand and its argument verbatim", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["install", "npm:pi-btw"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["install", "npm:pi-btw"]);
	assert.equal(payload.PI_CODING_AGENT_DIR, f.gentleShellHome);
});

test("a too-old pi exits 1 naming both versions", (t) => {
	const f = fixture(t);
	writePiScript(f.piScript, "0.80.0");
	const result = run(f.env, []);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /0\.80\.0/);
	assert.match(result.stderr, /0\.85\.1/);
});

test("--version prints three lines", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--version"]);
	assert.equal(result.status, 0, result.stderr);
	const lines = result.stdout.trim().split("\n");
	assert.equal(lines.length, 3);
	assert.match(lines[0], /^gentle-shell /);
	assert.match(lines[1], /^pi 0\.85\.1$/);
	assert.match(lines[2], /^home isolated /);
});
