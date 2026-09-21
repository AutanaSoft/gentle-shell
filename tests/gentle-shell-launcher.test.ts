import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	MIN_PI_VERSION,
	buildPiInvocation,
	checkPiVersion,
	describeVersion,
	helpText,
	launcherConfigPath,
	missingPiMessage,
	parseLauncherArgs,
	parseLauncherConfig,
	resolveHome,
	resolvePiRuntime,
	settingsDeclareGentlePi,
	type ParsedLauncherArgs,
	type ResolvedHome,
} from "../lib/gentle-shell-launcher.ts";

const packageRoot = join(fileURLToPath(import.meta.url), "..", "..");

// --- parseLauncherArgs -------------------------------------------------

test("parseLauncherArgs returns all-false defaults for an empty argv", () => {
	const parsed = parseLauncherArgs([]);
	assert.deepEqual(parsed, {
		link: false,
		isolated: false,
		home: undefined,
		help: false,
		version: false,
		command: undefined,
		commandArgs: [],
		passthrough: [],
		error: undefined,
	});
});

test("parseLauncherArgs sets link on --link", () => {
	assert.equal(parseLauncherArgs(["--link"]).link, true);
});

test("parseLauncherArgs sets isolated on --isolated", () => {
	assert.equal(parseLauncherArgs(["--isolated"]).isolated, true);
});

test("parseLauncherArgs captures a --home value from the next argument", () => {
	assert.equal(parseLauncherArgs(["--home", "/custom/path"]).home, "/custom/path");
});

test("parseLauncherArgs captures a --home=<path> value", () => {
	assert.equal(parseLauncherArgs(["--home=/custom/path"]).home, "/custom/path");
});

test("parseLauncherArgs reports an error when --home has no value", () => {
	const parsed = parseLauncherArgs(["--home"]);
	assert.equal(parsed.home, undefined);
	assert.match(parsed.error ?? "", /--home/);
});

test("parseLauncherArgs sets help on --help and -h", () => {
	assert.equal(parseLauncherArgs(["--help"]).help, true);
	assert.equal(parseLauncherArgs(["-h"]).help, true);
});

test("parseLauncherArgs sets version on --version", () => {
	assert.equal(parseLauncherArgs(["--version"]).version, true);
});

test("parseLauncherArgs stops launcher parsing at -- and forwards the rest", () => {
	const parsed = parseLauncherArgs(["--isolated", "--", "--link", "--help"]);
	assert.equal(parsed.isolated, true);
	assert.equal(parsed.link, false);
	assert.equal(parsed.help, false);
	assert.deepEqual(parsed.passthrough, ["--link", "--help"]);
});

test("parseLauncherArgs forwards unrecognised arguments as passthrough, in order", () => {
	const parsed = parseLauncherArgs(["--mode", "rpc", "-p", "hi", "--resume"]);
	assert.deepEqual(parsed.passthrough, ["--mode", "rpc", "-p", "hi", "--resume"]);
});

test("parseLauncherArgs mixes launcher flags and passthrough while keeping passthrough order", () => {
	const parsed = parseLauncherArgs(["--isolated", "--mode", "rpc", "-p", "hi"]);
	assert.equal(parsed.isolated, true);
	assert.deepEqual(parsed.passthrough, ["--mode", "rpc", "-p", "hi"]);
});

test("parseLauncherArgs recognises the home subcommand as argv[0] and captures the rest as commandArgs", () => {
	const parsed = parseLauncherArgs(["home", "link"]);
	assert.equal(parsed.command, "home");
	assert.deepEqual(parsed.commandArgs, ["link"]);
	assert.deepEqual(parsed.passthrough, []);
});

test("parseLauncherArgs treats home as a plain passthrough token when it is not argv[0]", () => {
	const parsed = parseLauncherArgs(["--isolated", "home"]);
	assert.equal(parsed.command, undefined);
	assert.deepEqual(parsed.passthrough, ["home"]);
});

test("parseLauncherArgs errors when --link is combined with --isolated", () => {
	const parsed = parseLauncherArgs(["--link", "--isolated"]);
	assert.match(parsed.error ?? "", /--link/);
	assert.match(parsed.error ?? "", /--isolated/);
});

test("parseLauncherArgs errors when --link is combined with --home", () => {
	const parsed = parseLauncherArgs(["--link", "--home", "/custom"]);
	assert.match(parsed.error ?? "", /--link/);
	assert.match(parsed.error ?? "", /--home/);
});

test("parseLauncherArgs errors when --home is combined with --link regardless of order", () => {
	const parsed = parseLauncherArgs(["--home", "/custom", "--link"]);
	assert.match(parsed.error ?? "", /--link/);
});

// --- resolveHome ---------------------------------------------------------

function args(overrides: Partial<ParsedLauncherArgs> = {}): ParsedLauncherArgs {
	return {
		link: false,
		isolated: false,
		home: undefined,
		help: false,
		version: false,
		command: undefined,
		commandArgs: [],
		passthrough: [],
		error: undefined,
		...overrides,
	};
}

test("resolveHome honours --link and reads PI_CODING_AGENT_DIR", () => {
	const resolved = resolveHome({
		args: args({ link: true }),
		env: { PI_CODING_AGENT_DIR: "/pi/agent" },
		homedir: "/home/alan",
		config: undefined,
	});
	assert.deepEqual(resolved, { mode: "link", dir: "/pi/agent", source: "flag" });
});

test("resolveHome falls back to <homedir>/.pi/agent for --link with no override", () => {
	const resolved = resolveHome({ args: args({ link: true }), env: {}, homedir: "/home/alan", config: undefined });
	assert.deepEqual(resolved, { mode: "link", dir: join("/home/alan", ".pi", "agent"), source: "flag" });
});

test("resolveHome honours --isolated and reads GENTLE_SHELL_HOME", () => {
	const resolved = resolveHome({
		args: args({ isolated: true }),
		env: { GENTLE_SHELL_HOME: "/custom/isolated" },
		homedir: "/home/alan",
		config: undefined,
	});
	assert.deepEqual(resolved, { mode: "isolated", dir: "/custom/isolated", source: "flag" });
});

test("resolveHome falls back to <homedir>/.gentle-shell/agent for --isolated with no override", () => {
	const resolved = resolveHome({ args: args({ isolated: true }), env: {}, homedir: "/home/alan", config: undefined });
	assert.deepEqual(resolved, { mode: "isolated", dir: join("/home/alan", ".gentle-shell", "agent"), source: "flag" });
});

test("resolveHome uses the --home value verbatim", () => {
	const resolved = resolveHome({ args: args({ home: "/explicit/path" }), env: {}, homedir: "/home/alan", config: undefined });
	assert.deepEqual(resolved, { mode: "path", dir: "/explicit/path", source: "flag" });
});

test("resolveHome falls back to a persisted link config", () => {
	const resolved = resolveHome({ args: args(), env: {}, homedir: "/home/alan", config: { home: "link" } });
	assert.deepEqual(resolved, { mode: "link", dir: join("/home/alan", ".pi", "agent"), source: "config" });
});

test("resolveHome falls back to a persisted isolated config", () => {
	const resolved = resolveHome({ args: args(), env: {}, homedir: "/home/alan", config: { home: "isolated" } });
	assert.deepEqual(resolved, { mode: "isolated", dir: join("/home/alan", ".gentle-shell", "agent"), source: "config" });
});

test("resolveHome falls back to a persisted path config", () => {
	const resolved = resolveHome({ args: args(), env: {}, homedir: "/home/alan", config: { home: "/persisted/path" } });
	assert.deepEqual(resolved, { mode: "path", dir: "/persisted/path", source: "config" });
});

test("resolveHome defaults to isolated when neither a flag nor a config is present", () => {
	const resolved = resolveHome({ args: args(), env: {}, homedir: "/home/alan", config: undefined });
	assert.deepEqual(resolved, { mode: "isolated", dir: join("/home/alan", ".gentle-shell", "agent"), source: "default" });
});

test("resolveHome lets a flag override a persisted config", () => {
	const resolved = resolveHome({ args: args({ link: true }), env: {}, homedir: "/home/alan", config: { home: "isolated" } });
	assert.equal(resolved.mode, "link");
	assert.equal(resolved.source, "flag");
});

// --- launcherConfigPath / parseLauncherConfig -----------------------------

test("launcherConfigPath points at <homedir>/.gentle-shell/config.json", () => {
	assert.equal(launcherConfigPath("/home/alan"), join("/home/alan", ".gentle-shell", "config.json"));
});

test("parseLauncherConfig accepts a link config", () => {
	assert.deepEqual(parseLauncherConfig('{"home":"link"}'), { home: "link" });
});

test("parseLauncherConfig accepts an isolated config", () => {
	assert.deepEqual(parseLauncherConfig('{"home":"isolated"}'), { home: "isolated" });
});

test("parseLauncherConfig accepts a path config", () => {
	assert.deepEqual(parseLauncherConfig('{"home":"/custom/path"}'), { home: "/custom/path" });
});

test("parseLauncherConfig tolerates invalid JSON", () => {
	assert.equal(parseLauncherConfig("not json"), undefined);
});

test("parseLauncherConfig tolerates a missing home field", () => {
	assert.equal(parseLauncherConfig("{}"), undefined);
});

test("parseLauncherConfig tolerates a non-object document", () => {
	assert.equal(parseLauncherConfig("[]"), undefined);
	assert.equal(parseLauncherConfig('"link"'), undefined);
});

test("parseLauncherConfig tolerates a non-string home value", () => {
	assert.equal(parseLauncherConfig('{"home":1}'), undefined);
});

test("parseLauncherConfig tolerates an empty home value", () => {
	assert.equal(parseLauncherConfig('{"home":""}'), undefined);
});

// --- resolvePiRuntime ------------------------------------------------------

test("resolvePiRuntime prefers GENTLE_SHELL_PI over every other source", () => {
	const runtime = resolvePiRuntime({
		env: { GENTLE_SHELL_PI: "/opt/pi/pi" },
		resolveBundledCli: () => "/bundled/cli.js",
		findOnPath: () => "/usr/bin/pi",
		nodeExecPath: "/usr/bin/node",
	});
	assert.deepEqual(runtime, { kind: "env", command: "/opt/pi/pi", args: [] });
});

test("resolvePiRuntime falls back to the bundled CLI run with the current node", () => {
	const runtime = resolvePiRuntime({
		env: {},
		resolveBundledCli: () => "/bundled/cli.js",
		findOnPath: () => "/usr/bin/pi",
		nodeExecPath: "/usr/bin/node",
	});
	assert.deepEqual(runtime, { kind: "bundled", command: "/usr/bin/node", args: ["/bundled/cli.js"] });
});

test("resolvePiRuntime falls back to pi on PATH when nothing else resolves", () => {
	const runtime = resolvePiRuntime({
		env: {},
		resolveBundledCli: () => undefined,
		findOnPath: (name) => (name === "pi" ? "/usr/bin/pi" : undefined),
		nodeExecPath: "/usr/bin/node",
	});
	assert.deepEqual(runtime, { kind: "path", command: "/usr/bin/pi", args: [] });
});

test("resolvePiRuntime returns undefined when no source resolves", () => {
	const runtime = resolvePiRuntime({
		env: {},
		resolveBundledCli: () => undefined,
		findOnPath: () => undefined,
		nodeExecPath: "/usr/bin/node",
	});
	assert.equal(runtime, undefined);
});

test("resolvePiRuntime treats an empty GENTLE_SHELL_PI as unset", () => {
	const runtime = resolvePiRuntime({
		env: { GENTLE_SHELL_PI: "" },
		resolveBundledCli: () => "/bundled/cli.js",
		findOnPath: () => undefined,
		nodeExecPath: "/usr/bin/node",
	});
	assert.deepEqual(runtime, { kind: "bundled", command: "/usr/bin/node", args: ["/bundled/cli.js"] });
});

test("missingPiMessage names the three resolution options", () => {
	const message = missingPiMessage();
	assert.match(message, /GENTLE_SHELL_PI/);
	assert.match(message, /@earendil-works\/pi-coding-agent/);
	assert.match(message, /PATH/);
});

// --- checkPiVersion ---------------------------------------------------------

test("MIN_PI_VERSION matches the pinned peer dependency, so the two cannot drift", () => {
	const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
		peerDependencies: Record<string, string>;
	};
	const pinned = packageJson.peerDependencies["@earendil-works/pi-coding-agent"];
	assert.match(pinned, /^>=\d+\.\d+\.\d+$/, "expected a simple >=x.y.z peer range");
	assert.equal(MIN_PI_VERSION, pinned.replace(/^>=/, ""));
});

test("checkPiVersion accepts a version equal to the minimum", () => {
	assert.deepEqual(checkPiVersion("0.85.1"), { ok: true, version: "0.85.1" });
});

test("checkPiVersion accepts a version above the minimum", () => {
	assert.deepEqual(checkPiVersion("0.86.0"), { ok: true, version: "0.86.0" });
});

test("checkPiVersion accepts a v-prefixed version", () => {
	assert.deepEqual(checkPiVersion("v0.85.1"), { ok: true, version: "0.85.1" });
});

test("checkPiVersion accepts a prerelease suffix at the minimum", () => {
	assert.deepEqual(checkPiVersion("pi version 0.85.1-rc.2"), { ok: true, version: "0.85.1" });
});

test("checkPiVersion rejects a version below the minimum and names both versions", () => {
	const result = checkPiVersion("0.85.0");
	assert.equal(result.ok, false);
	if (result.ok) throw new Error("expected a failing result");
	assert.equal(result.version, "0.85.0");
	assert.match(result.message, /0\.85\.0/);
	assert.match(result.message, /0\.85\.1/);
});

test("checkPiVersion rejects a prerelease below the minimum", () => {
	const result = checkPiVersion("0.85.0-beta.1");
	assert.equal(result.ok, false);
});

test("checkPiVersion reports unparsable output with the raw text and the minimum", () => {
	const result = checkPiVersion("  not a version  ");
	assert.equal(result.ok, false);
	if (result.ok) throw new Error("expected a failing result");
	assert.equal(result.version, undefined);
	assert.match(result.message, /not a version/);
	assert.match(result.message, /0\.85\.1/);
});

test("checkPiVersion accepts a custom minimum", () => {
	assert.equal(checkPiVersion("1.0.0", "1.1.0").ok, false);
	assert.equal(checkPiVersion("1.1.0", "1.1.0").ok, true);
	assert.equal(checkPiVersion("1.2.0", "1.1.0").ok, true);
});

// --- settingsDeclareGentlePi ------------------------------------------------

test("settingsDeclareGentlePi is false when settings text is undefined", () => {
	assert.equal(settingsDeclareGentlePi(undefined), false);
});

test("settingsDeclareGentlePi is false for invalid JSON", () => {
	assert.equal(settingsDeclareGentlePi("not json"), false);
});

test("settingsDeclareGentlePi is false when packages is absent", () => {
	assert.equal(settingsDeclareGentlePi("{}"), false);
});

test("settingsDeclareGentlePi detects a bare npm:gentle-pi string entry", () => {
	assert.equal(settingsDeclareGentlePi('{"packages":["npm:gentle-pi"]}'), true);
});

test("settingsDeclareGentlePi detects a versioned npm:gentle-pi string entry", () => {
	assert.equal(settingsDeclareGentlePi('{"packages":["npm:gentle-pi@3.3.0"]}'), true);
});

test("settingsDeclareGentlePi detects a bare npm:gentle-pi object source entry", () => {
	assert.equal(settingsDeclareGentlePi('{"packages":[{"source":"npm:gentle-pi"}]}'), true);
});

test("settingsDeclareGentlePi detects a versioned npm:gentle-pi object source entry", () => {
	assert.equal(settingsDeclareGentlePi('{"packages":[{"source":"npm:gentle-pi@3.3.0"}]}'), true);
});

test("settingsDeclareGentlePi is false when packages lists unrelated entries", () => {
	assert.equal(settingsDeclareGentlePi('{"packages":["npm:some-other-package"]}'), false);
});

// --- buildPiInvocation -------------------------------------------------------

const linkHome: ResolvedHome = { mode: "link", dir: "/pi/agent", source: "flag" };
const isolatedHomeResolved: ResolvedHome = { mode: "isolated", dir: "/gentle-shell/agent", source: "default" };

test("buildPiInvocation injects the launcher env into baseEnv", () => {
	const built = buildPiInvocation({
		runtime: { kind: "path", command: "/usr/bin/pi", args: [] },
		home: linkHome,
		packageRoot: "/pkg",
		settingsDeclareGentlePi: true,
		passthrough: [],
		baseEnv: { PATH: "/usr/bin" },
	});
	assert.deepEqual(built.env, { PATH: "/usr/bin", PI_CODING_AGENT_DIR: "/pi/agent", GENTLE_PI_AGENT_HOME: "/pi/agent" });
});

test("buildPiInvocation skips the gentle-pi injection flags when settings already declare the package", () => {
	const built = buildPiInvocation({
		runtime: { kind: "path", command: "/usr/bin/pi", args: [] },
		home: linkHome,
		packageRoot: "/pkg",
		settingsDeclareGentlePi: true,
		passthrough: ["--mode", "rpc"],
		baseEnv: {},
	});
	assert.deepEqual(built.command, "/usr/bin/pi");
	assert.deepEqual(built.args, ["--mode", "rpc"]);
});

test("buildPiInvocation adds the gentle-pi injection flags when settings do not declare the package", () => {
	const built = buildPiInvocation({
		runtime: { kind: "path", command: "/usr/bin/pi", args: [] },
		home: isolatedHomeResolved,
		packageRoot: "/pkg",
		settingsDeclareGentlePi: false,
		passthrough: ["--mode", "rpc"],
		baseEnv: {},
	});
	assert.deepEqual(built.args, [
		"-e",
		"/pkg",
		"--theme",
		join("/pkg", "themes"),
		"--skill",
		join("/pkg", "skills"),
		"--prompt-template",
		join("/pkg", "prompts"),
		"--mode",
		"rpc",
	]);
});

test("buildPiInvocation keeps the runtime's own args ahead of the injection and passthrough", () => {
	const built = buildPiInvocation({
		runtime: { kind: "bundled", command: "/usr/bin/node", args: ["/bundled/cli.js"] },
		home: isolatedHomeResolved,
		packageRoot: "/pkg",
		settingsDeclareGentlePi: false,
		passthrough: [],
		baseEnv: {},
	});
	assert.equal(built.args[0], "/bundled/cli.js");
	assert.equal(built.command, "/usr/bin/node");
});

// --- describeVersion / helpText ----------------------------------------------

test("describeVersion formats the three-line report with a found pi version", () => {
	const text = describeVersion({ gentlePiVersion: "3.3.0", piVersion: "0.85.1", home: linkHome });
	assert.equal(text, "gentle-shell 3.3.0\npi 0.85.1\nhome link /pi/agent");
});

test("describeVersion reports pi as not found when no pi version is available", () => {
	const text = describeVersion({ gentlePiVersion: "3.3.0", piVersion: undefined, home: isolatedHomeResolved });
	assert.equal(text, "gentle-shell 3.3.0\npi not found\nhome isolated /gentle-shell/agent");
});

test("helpText documents the launcher flags, the home subcommand, the env vars, and passthrough forwarding", () => {
	const text = helpText();
	assert.match(text, /--link/);
	assert.match(text, /--isolated/);
	assert.match(text, /--home/);
	assert.match(text, /\bhome\b/);
	assert.match(text, /GENTLE_SHELL_PI/);
	assert.match(text, /GENTLE_SHELL_HOME/);
	assert.match(text, /PI_CODING_AGENT_DIR/);
	assert.match(text, /forward/i);
});
