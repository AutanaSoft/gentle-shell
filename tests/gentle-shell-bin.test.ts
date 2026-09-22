import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function run(env: NodeJS.ProcessEnv, args: string[], options: { cwd?: string } = {}) {
	return spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8", env, ...options });
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

// --- --link takeover of a conflicting path package -----------------------
//
// Regression coverage for the settings.json shape that triggered the tool
// conflict bug: gentle-pi declared as a relative *path* package (not
// npm:gentle-pi) alongside another package. findGentlePiDeclaration now
// recognises that path declaration by reading its package.json "name", and
// the launcher takes over the pi invocation instead of also injecting its
// own -e, which used to load two copies of gentle-pi side by side.

test("--link takes over a path-declared conflicting gentle-pi: --no-extensions, the other package's dir, then this launcher's own -e, settings byte-identical", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	// "npm:some-other" must actually be installed under
	// <agentDir>/npm/node_modules for it to be re-injected (R3-001): a
	// declared-but-missing package dir is now skipped with a warning instead.
	mkdirSync(join(piAgentDir, "npm", "node_modules", "some-other"), { recursive: true });

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other", "../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--mode", "rpc"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	assert.match(result.stderr, /taking over gentle-pi from/);
	assert.match(result.stderr, /other-gentle-pi/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(piAgentDir, "npm", "node_modules", "some-other"),
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
	]);

	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
	assert.equal(payload.PI_CODING_AGENT_DIR, piAgentDir);
});

test("--link install npm:x with a path-declared conflicting gentle-pi in settings forwards the bare subcommand, no take-over", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other", "../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "install", "npm:x"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /taking over gentle-pi from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["install", "npm:x"]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
	assert.equal(payload.PI_CODING_AGENT_DIR, piAgentDir);
});

test("--link does not take over a git-sourced other package: it is skipped with a warning, not injected", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	const settingsPath = join(piAgentDir, "settings.json");
	writeFileSync(settingsPath, JSON.stringify({ packages: ["git:github.com/foo/bar", "../other-gentle-pi"] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /skipping git-sourced package/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot, "--theme", join(packageRoot, "themes"), "--skill", join(packageRoot, "skills"), "--prompt-template", join(packageRoot, "prompts")]);
});

test("--package-root forces a takeover even when settings already declare a matching npm:gentle-pi", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", forcedRoot], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over gentle-pi from npm:gentle-pi/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		forcedRoot,
		"--theme",
		join(forcedRoot, "themes"),
		"--skill",
		join(forcedRoot, "skills"),
		"--prompt-template",
		join(forcedRoot, "prompts"),
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--package-root forces a takeover even with no gentle-pi declaration at all: --no-extensions and the other packages are still injected", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	// "npm:some-other" must actually be installed under
	// <agentDir>/npm/node_modules for it to be re-injected (R3-001).
	mkdirSync(join(piAgentDir, "npm", "node_modules", "some-other"), { recursive: true });
	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other"] });
	writeFileSync(settingsPath, settingsText);

	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", forcedRoot], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over gentle-pi from the requested package root/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(piAgentDir, "npm", "node_modules", "some-other"),
		"-e",
		forcedRoot,
		"--theme",
		join(forcedRoot, "themes"),
		"--skill",
		join(forcedRoot, "skills"),
		"--prompt-template",
		join(forcedRoot, "prompts"),
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--link take-over with --package-root injects exactly one -e when a settings path entry reaches the same physical directory through a symlink (R4-forced-root-symlink-double-injection)", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const packagesDir = join(piAgentDir, "packages");
	const realOtherDir = join(packagesDir, "real-other");
	mkdirSync(realOtherDir, { recursive: true });
	const linkOtherDir = join(packagesDir, "link-other");
	symlinkSync(realOtherDir, linkOtherDir, "dir");

	// settings declares the SYMLINK path; --package-root names the REAL path
	// directly. Both spellings reach the same physical directory, so it must
	// be injected exactly once instead of twice (once as an "other package"
	// via the symlink, once as this launcher's own package root).
	const settingsPath = join(piAgentDir, "settings.json");
	writeFileSync(settingsPath, JSON.stringify({ packages: [join("packages", "link-other")] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", realOtherDir], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.equal(payload.args.filter((arg: string) => arg === "-e").length, 1);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		realOtherDir,
		"--theme",
		join(realOtherDir, "themes"),
		"--skill",
		join(realOtherDir, "skills"),
		"--prompt-template",
		join(realOtherDir, "prompts"),
	]);
});

// --- loose extension files re-injected during a take-over -----------------
//
// Regression coverage for R4-003/R3-003 (and the follow-up bug it left
// behind): --no-extensions drops pi's normal settings-driven extension
// discovery, which also happens to be how pi finds loose (non-package)
// extensions under <agentDir>/extensions and the project-local
// <cwd>/.pi/extensions. Re-injecting those two directories wholesale as
// `-e <dir>` does not work: pi's `-e` flag hands the path straight to its
// module loader (no directory-discovery pass), so a bare directory holding
// only loose files fails with "Cannot find module ...". A take-over must
// instead discover each loose file the same way pi's own directory scan
// would (see discoverLooseExtensionEntries) and inject it individually.

test("--link take-over re-injects loose extension files, one -e per discovered file, from <agentDir>/extensions and the project-local .pi/extensions", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	// <agentDir>/extensions: a.ts, b.js, c.ts.bak-pre-fullscreen-fix (skipped,
	// suffix doesn't end in .ts/.js/.mjs), sub/index.ts, .hidden.ts (skipped).
	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(join(looseAgentExtensions, "sub"), { recursive: true });
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");
	writeFileSync(join(looseAgentExtensions, "b.js"), "export default () => {};");
	writeFileSync(join(looseAgentExtensions, "gentle-agent-state.ts.bak-pre-fullscreen-fix"), "stale backup");
	writeFileSync(join(looseAgentExtensions, ".hidden.ts"), "export default () => {};");
	writeFileSync(join(looseAgentExtensions, "sub", "index.ts"), "export default () => {};");

	const projectDir = join(f.root, "project");
	const looseProjectExtensions = join(projectDir, ".pi", "extensions");
	mkdirSync(looseProjectExtensions, { recursive: true });
	writeFileSync(join(looseProjectExtensions, "project-ext.mjs"), "export default () => {};");
	// The launcher derives this dir from process.cwd() inside the spawned
	// child, which resolves symlinks (e.g. macOS's /tmp -> /private/tmp);
	// realpath the expectation the same way so the two agree everywhere.
	const resolvedLooseProjectExtensions = join(realpathSync(projectDir), ".pi", "extensions");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--mode", "rpc"], { cwd: projectDir });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over gentle-pi from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "a.ts"),
		"-e",
		join(looseAgentExtensions, "b.js"),
		"-e",
		join(looseAgentExtensions, "sub", "index.ts"),
		"-e",
		join(resolvedLooseProjectExtensions, "project-ext.mjs"),
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
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--link take-over injects a root-level index.ts as its own loose file entry, alongside a sibling loose file (R4-loose-index-collapses-sibling-extensions)", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "index.ts"), "export default () => {};");
	// A root-level index.ts is just another loose file, not a marker that
	// collapses the whole directory into a single -e <dir>: pi's own
	// discovery loads every direct *.ts/*.js/*.mjs file individually, so a
	// sibling like extra.ts must keep loading too instead of being dropped.
	writeFileSync(join(looseAgentExtensions, "extra.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "extra.ts"),
		"-e",
		join(looseAgentExtensions, "index.ts"),
		"-e",
		packageRoot,
		"--theme",
		join(packageRoot, "themes"),
		"--skill",
		join(packageRoot, "skills"),
		"--prompt-template",
		join(packageRoot, "prompts"),
	]);
});

test("--link take-over injects a subdirectory's own index.ts entry point even when the loose extensions dir has no other direct files", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	const subDir = join(looseAgentExtensions, "sub");
	mkdirSync(subDir, { recursive: true });
	writeFileSync(join(subDir, "index.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(subDir, "index.ts"),
		"-e",
		packageRoot,
		"--theme",
		join(packageRoot, "themes"),
		"--skill",
		join(packageRoot, "skills"),
		"--prompt-template",
		join(packageRoot, "prompts"),
	]);
});

test("--link take-over omits -e flags for loose extension dirs that do not exist", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot, "--theme", join(packageRoot, "themes"), "--skill", join(packageRoot, "skills"), "--prompt-template", join(packageRoot, "prompts")]);
});

// --- R3-001/R4-takeover-injects-unverified-package-dirs -------------------
//
// A settings.json package that is declared but not actually installed on
// disk (hand-edited file, a failed or interrupted `pi install`, an npm store
// laid out anywhere other than <agentDir>/npm/node_modules) must not be
// handed to pi as an unresolvable -e: pi's module loader fails on it with
// "Cannot find module", which would break every take-over launch against a
// partially-installed home. It is filtered the same way loose extension
// candidates already are, with one stderr warning naming the source and the
// resolved path, and the launch still succeeds.

test("--link take-over skips a declared package directory that is not installed, warns, and still launches; an installed one is still injected", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	// "npm:some-other" is declared but never installed under
	// <agentDir>/npm/node_modules, so its resolved directory does not exist.
	// "npm:installed-other" IS installed, so it must still be injected.
	const installedOtherDir = join(piAgentDir, "npm", "node_modules", "installed-other");
	mkdirSync(installedOtherDir, { recursive: true });

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other", "npm:installed-other", "../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--mode", "rpc"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	assert.match(result.stderr, /skipping declared package "npm:some-other"/);
	assert.match(result.stderr, /is not a directory/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		installedOtherDir,
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
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--link take-over injects the launcher's own package root once when --package-root names a directory settings also declare as a plain path entry", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const settingsPath = join(piAgentDir, "settings.json");
	// The forced root is also declared as an ordinary (non-gentle-pi) path
	// package, so otherPackageInjections would resolve it to the same
	// directory as --package-root.
	const settingsText = JSON.stringify({ packages: ["../forced-root"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", forcedRoot], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	const eFlags = payload.args.filter((arg: string, index: number) => payload.args[index - 1] === "-e");
	assert.deepEqual(eFlags, [forcedRoot]);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		forcedRoot,
		"--theme",
		join(forcedRoot, "themes"),
		"--skill",
		join(forcedRoot, "skills"),
		"--prompt-template",
		join(forcedRoot, "prompts"),
	]);
});

test("--isolated --package-root produces the plain injection (no --no-extensions): the take-over path is gated on link mode", (t) => {
	const f = fixture(t);
	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const result = run(f.env, ["--isolated", "--package-root", forcedRoot, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /taking over gentle-pi from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"-e",
		forcedRoot,
		"--theme",
		join(forcedRoot, "themes"),
		"--skill",
		join(forcedRoot, "skills"),
		"--prompt-template",
		join(forcedRoot, "prompts"),
		"--mode",
		"rpc",
	]);
});

test("--package-root naming a directory that does not exist fails with a clear error instead of launching", (t) => {
	const f = fixture(t);
	const missingRoot = join(f.root, "does-not-exist");

	const result = run(f.env, ["--package-root", missingRoot]);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /--package-root/);
	assert.match(result.stderr, /does not exist|not a directory/);
});

// --- R4-loose-extension-enumeration-fails-silently -------------------------

test("--link take-over warns once when a loose extensions directory cannot be read, instead of failing silently", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");
	chmodSync(looseAgentExtensions, 0o000);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	// Restore permissions immediately, before any assertion can throw and
	// skip cleanup: fixture()'s own t.after (registered before this test body
	// runs) removes f.root recursively, which requires read/execute
	// permission on every subdirectory, including this one.
	chmodSync(looseAgentExtensions, 0o755);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /could not read loose extension directory/);
	assert.match(result.stderr, /extensions/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot, "--theme", join(packageRoot, "themes"), "--skill", join(packageRoot, "skills"), "--prompt-template", join(packageRoot, "prompts")]);
});

// --- R3-004: loose-extensions manifest branch coverage ----------------------

test("--link take-over falls through to per-file discovery when a loose dir's package.json declares an empty pi.extensions array", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "package.json"), JSON.stringify({ pi: { extensions: [] } }));
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "a.ts"),
		"-e",
		packageRoot,
		"--theme",
		join(packageRoot, "themes"),
		"--skill",
		join(packageRoot, "skills"),
		"--prompt-template",
		join(packageRoot, "prompts"),
	]);
});

test("--link take-over treats a malformed package.json as no manifest and falls through to per-file discovery", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "package.json"), "{ not valid json");
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "a.ts"),
		"-e",
		packageRoot,
		"--theme",
		join(packageRoot, "themes"),
		"--skill",
		join(packageRoot, "skills"),
		"--prompt-template",
		join(packageRoot, "prompts"),
	]);
});

// --- R4-takeover-leaves-two-gentle-pi-skill-sets-loaded ---------------------

test("--link take-over stderr message also notes that the taken-over declaration's skills, prompts, and themes still load alongside this launcher's", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over gentle-pi from/);
	assert.match(result.stderr, /skills, prompts, and themes/);
});

test("--link take-over treats a file named `extensions` as not a loose extension dir", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "gentle-pi" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));
	writeFileSync(join(piAgentDir, "extensions"), "not a directory");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot, "--theme", join(packageRoot, "themes"), "--skill", join(packageRoot, "skills"), "--prompt-template", join(packageRoot, "prompts")]);
});
