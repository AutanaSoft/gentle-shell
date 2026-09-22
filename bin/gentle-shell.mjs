#!/usr/bin/env node
// Thin process/fs/exec glue around lib/gentle-shell-launcher.ts (built to
// runtime/gentle-shell-launcher.mjs). All decision logic — argv parsing, home
// resolution, pi resolution order, the version gate, and the pi invocation —
// lives in that pure, unit-tested module; this file only wires it to the real
// process, filesystem, and child process.
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { constants as osConstants, homedir } from "node:os";
import { delimiter, dirname, join, resolve as resolvePath } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	buildPiInvocation,
	checkPiVersion,
	describeVersion,
	helpText,
	launcherConfigPath,
	missingPiMessage,
	parseLauncherArgs,
	parseLauncherConfig,
	planSpawn,
	resolveHome,
	resolvePiRuntime,
	settingsDeclareGentlePi,
} from "../runtime/gentle-shell-launcher.mjs";
import { installIsolatedTuiModeSetting } from "../scripts/install-tui-mode-setting.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message, code) {
	process.stderr.write(`${message}\n`);
	process.exit(code);
}

function readJsonIfExists(path) {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

// @earendil-works/pi-coding-agent ships as an optional peer dependency: it may
// not be installed at all, so a resolution failure here is expected, not an error.
function resolveBundledCli() {
	try {
		const require = createRequire(import.meta.url);
		const pkgJsonPath = require.resolve("@earendil-works/pi-coding-agent/package.json");
		const cliPath = join(dirname(pkgJsonPath), "dist", "bundle", "cli.js");
		return existsSync(cliPath) ? cliPath : undefined;
	} catch {
		return undefined;
	}
}

function findOnPath(name) {
	const dirs = (process.env.PATH || "").split(delimiter).filter((entry) => entry.length > 0);
	const extensions = process.platform === "win32" ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
	for (const dir of dirs) {
		for (const extension of extensions) {
			const candidate = join(dir, `${name}${extension}`);
			try {
				accessSync(candidate, fsConstants.X_OK);
				return candidate;
			} catch {
				// keep scanning
			}
		}
	}
	return undefined;
}

function signalExitCode(signal) {
	const number = osConstants.signals[signal];
	return 128 + (typeof number === "number" ? number : 0);
}

function ownPackageVersion() {
	const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	return packageJson.version;
}

function emptyArgs() {
	return { link: false, isolated: false, home: undefined, help: false, version: false, command: undefined, commandArgs: [], passthrough: [], error: undefined };
}

function loadConfig() {
	const configPath = launcherConfigPath(homedir());
	const text = readJsonIfExists(configPath);
	return text === undefined ? undefined : parseLauncherConfig(text);
}

function handleHomeCommand(commandArgs) {
	if (commandArgs.length === 0) {
		const resolved = resolveHome({ args: emptyArgs(), env: process.env, homedir: homedir(), config: loadConfig() });
		process.stdout.write(`${resolved.mode} ${resolved.dir}\n`);
		process.exit(0);
	}
	if (commandArgs.length > 1) fail("gentle-shell home accepts at most one argument. Run 'gentle-shell --help'.", 2);
	const [value] = commandArgs;
	if (value.length === 0) fail("gentle-shell home requires a non-empty argument. Run 'gentle-shell --help'.", 2);

	const configPath = launcherConfigPath(homedir());
	const configDir = dirname(configPath);
	if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true, mode: 0o700 });

	if (value === "link" || value === "isolated") {
		writeFileSync(configPath, `${JSON.stringify({ home: value }, null, 2)}\n`, "utf8");
		process.stdout.write(`Saved home: ${value}\n`);
		process.exit(0);
	}
	const dir = resolvePath(value);
	writeFileSync(configPath, `${JSON.stringify({ home: dir }, null, 2)}\n`, "utf8");
	process.stdout.write(`Saved home: path ${dir}\n`);
	process.exit(0);
}

async function main() {
	const args = parseLauncherArgs(process.argv.slice(2));
	if (args.error !== undefined) fail(`${args.error}\nRun 'gentle-shell --help' for usage.`, 2);
	if (args.help) {
		process.stdout.write(`${helpText()}\n`);
		process.exit(0);
	}
	if (args.command === "home") {
		handleHomeCommand(args.commandArgs);
		return;
	}

	const config = loadConfig();
	let home = resolveHome({ args, env: process.env, homedir: homedir(), config });
	if (home.mode === "path") home = { ...home, dir: resolvePath(home.dir) };

	const runtime = resolvePiRuntime({
		env: process.env,
		resolveBundledCli,
		findOnPath,
		nodeExecPath: process.execPath,
	});
	if (runtime === undefined) fail(missingPiMessage(), 1);

	const versionProbePlan = planSpawn({ command: runtime.command, args: [...runtime.args, "--version"], platform: process.platform });
	const versionProbe = spawnSync(versionProbePlan.command, versionProbePlan.args, {
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 15000,
		encoding: "utf8",
		shell: versionProbePlan.shell,
	});
	if (versionProbe.error) fail(`Could not run the pi runtime at "${runtime.command}": ${versionProbe.error.message}`, 1);
	const versionCheck = checkPiVersion(versionProbe.stdout ?? "");
	if (!versionCheck.ok) fail(versionCheck.message, 1);

	if (args.version) {
		process.stdout.write(`${describeVersion({ gentlePiVersion: ownPackageVersion(), piVersion: versionCheck.version, home })}\n`);
		process.exit(0);
	}

	// Isolated-home bootstrap: only on a home gentle-shell has not seen before
	// (link never bootstraps — it reuses the user's own pi agent home as-is).
	if ((home.mode === "isolated" || home.mode === "path") && !existsSync(home.dir)) {
		mkdirSync(home.dir, { recursive: true });
		await installIsolatedTuiModeSetting(home.dir);
		process.stderr.write(`gentle-shell: using a separate home at ${home.dir}. Run 'gentle-shell --link' to reuse your pi sign-ins and chats.\n`);
	}

	let linkDeclaresGentlePi = false;
	if (home.mode === "link") {
		const settingsText = readJsonIfExists(join(home.dir, "settings.json"));
		linkDeclaresGentlePi = settingsDeclareGentlePi(settingsText);
	}

	const invocation = buildPiInvocation({
		runtime,
		home,
		packageRoot,
		settingsDeclareGentlePi: home.mode === "link" ? linkDeclaresGentlePi : false,
		passthrough: args.passthrough,
		baseEnv: process.env,
	});

	const launchPlan = planSpawn({ command: invocation.command, args: invocation.args, platform: process.platform });
	const child = spawn(launchPlan.command, launchPlan.args, { stdio: "inherit", env: invocation.env, shell: launchPlan.shell });
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
		process.on(signal, () => child.kill(signal));
	}
	child.on("error", (error) => fail(`Could not start pi: ${error.message}`, 1));
	child.on("exit", (code, signal) => {
		process.exit(signal ? signalExitCode(signal) : (code ?? 1));
	});
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
