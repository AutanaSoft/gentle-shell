#!/usr/bin/env node
// Thin process/fs/exec glue around lib/gentle-shell-launcher.ts (built to
// runtime/gentle-shell-launcher.mjs). All decision logic — argv parsing, home
// resolution, pi resolution order, the version gate, and the pi invocation —
// lives in that pure, unit-tested module; this file only wires it to the real
// process, filesystem, and child process.
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { constants as osConstants, homedir } from "node:os";
import { delimiter, dirname, join, resolve as resolvePath } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	buildPiInvocation,
	checkPiVersion,
	decideTakeOver,
	describeVersion,
	discoverLooseExtensionEntries,
	findGentlePiDeclaration,
	helpText,
	isSetupCapablePin,
	launcherConfigPath,
	MIN_SETUP_GENTLE_AI_VERSION,
	missingPiMessage,
	otherPackageInjections,
	parseLauncherArgs,
	parseLauncherConfig,
	planSpawn,
	resolveHome,
	resolvePiRuntime,
} from "../runtime/gentle-shell-launcher.mjs";
import { GENTLE_AI_VERSION, gentleAiBinaryPath, PackageLocalGentleAiBinaryMissingError } from "../runtime/gentle-ai-binary.mjs";
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
	return {
		link: false,
		isolated: false,
		home: undefined,
		packageRoot: undefined,
		help: false,
		version: false,
		command: undefined,
		commandArgs: [],
		passthrough: [],
		piSubcommand: undefined,
		error: undefined,
	};
}

// package.json "name" reader injected into findGentlePiDeclaration: a
// missing or unreadable package.json, or a non-string "name", is never an
// error here — it just means that path package is not gentle-pi.
function readPackageName(dir) {
	try {
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		return typeof pkg.name === "string" ? pkg.name : undefined;
	} catch {
		return undefined;
	}
}

// Best-effort realpath: a directory that does not exist (yet, or ever)
// cannot be realpath'd, so the take-over decision falls back to comparing
// the raw path instead of failing.
function safeRealpath(path) {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

// Used to filter the loose extension dirs a take-over re-injects: a missing
// path, or one that is not a directory (for example a stray file named
// "extensions"), is silently excluded rather than passed to pi as -e.
function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

// Real-fs adapter for discoverLooseExtensionEntries (lib/gentle-shell-launcher.ts):
// statSync-based isFile/isDirectory (not readdirSync's Dirent, which uses
// lstat and so would treat a symlinked file or directory as neither) so a
// symlinked loose extension resolves the same way pi's own fs.existsSync-based
// checks would.
const looseExtensionFs = {
	readdir(dir) {
		let names;
		try {
			names = readdirSync(dir);
		} catch (error) {
			// resolveLooseExtensionEntries only calls this once isDirectory(dir)
			// has already confirmed the directory exists, so a failure here (for
			// example EACCES) is a real read failure, not a missing directory.
			// Warn instead of silently dropping every loose extension it would
			// have contributed (R4-loose-extension-enumeration-fails-silently).
			process.stderr.write(`gentle-shell: could not read loose extension directory ${dir}: ${error.message} (skipping)\n`);
			return [];
		}
		return names.map((name) => {
			const entryPath = join(dir, name);
			try {
				const entryStat = statSync(entryPath);
				return { name, isFile: entryStat.isFile(), isDirectory: entryStat.isDirectory() };
			} catch {
				return { name, isFile: false, isDirectory: false };
			}
		});
	},
	exists: existsSync,
};

// A loose extensions directory that is itself a self-contained extension —
// a package.json declaring a non-empty "pi.extensions" manifest — is passed
// through as a single -e <dir> instead of being broken into per-file
// entries: pi's own module loader (jiti) resolves that case directly,
// exactly as it would for any other explicitly configured package path. A
// root-level index.ts/index.js is deliberately NOT treated as that same
// marker: pi's own discovery loads it as just another loose file, so
// collapsing the whole directory on its presence silently dropped sibling
// loose files like extra.ts (R4-loose-index-collapses-sibling-extensions).
function readPiManifestExtensions(dir) {
	try {
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		return Array.isArray(pkg?.pi?.extensions) ? pkg.pi.extensions : undefined;
	} catch {
		return undefined;
	}
}

function looseDirHasOwnEntryPoint(dir) {
	const manifestExtensions = readPiManifestExtensions(dir);
	return manifestExtensions !== undefined && manifestExtensions.length > 0;
}

// Resolves one candidate loose-extensions directory (<agentDir>/extensions or
// <cwd>/.pi/extensions) into the -e entries a take-over must re-inject: the
// directory itself when it is a self-contained extension, otherwise every
// loose file discoverLooseExtensionEntries finds inside it. A missing or
// non-directory candidate resolves to no entries.
function resolveLooseExtensionEntries(dir) {
	if (!isDirectory(dir)) return [];
	if (looseDirHasOwnEntryPoint(dir)) return [dir];
	return discoverLooseExtensionEntries(dir, looseExtensionFs);
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

// Test/development-only override for the setup subcommand's gentle-ai
// executable path. Lets a test point at a stub script (or a deliberately
// missing path) without touching the real pinned .gentle-ai/v<version>/gentle-ai
// install this package ships, and without needing to fake its release-asset
// integrity manifest. Never consulted outside `setup`; see docs/readme-reference.md.
function resolveSetupGentleAiBinary() {
	const override = process.env.GENTLE_SHELL_GENTLE_AI_BIN;
	return override !== undefined && override.length > 0 ? override : gentleAiBinaryPath();
}

// Test/development-only override for the setup subcommand's reported
// package-local gentle-ai pin. Lets a test simulate an older or newer pin
// without changing the real installed .gentle-ai/v<version> bundle. Never
// consulted outside `setup`; see docs/readme-reference.md.
function resolveSetupGentleAiPin() {
	const override = process.env.GENTLE_SHELL_GENTLE_AI_PIN;
	return override !== undefined && override.length > 0 ? override : GENTLE_AI_VERSION;
}

// Provisions `home` with everything `gentle-ai install --agent pi` installs
// into a regular Pi, by spawning the package-local pinned gentle-ai binary
// (never a PATH `gentle-ai`) with PI_CODING_AGENT_DIR/GENTLE_PI_AGENT_HOME set
// to `home.dir` and the resolved pi runtime's directory prepended to PATH, so
// gentle-ai's own preflight finds `pi` even when it is bundled or given
// through GENTLE_SHELL_PI. `home` and `runtime` are resolved by the caller
// exactly as a normal run resolves them (including the isolated/--home
// bootstrap and the pi version gate). Precondition: the package-local
// gentle-ai pin must be at least MIN_SETUP_GENTLE_AI_VERSION — the first
// release that honors PI_CODING_AGENT_DIR here — or this refuses to spawn it,
// since an older pin would silently provision the caller's real ~/.pi/agent.
async function handleSetupCommand(commandArgs, home, runtime) {
	let dryRun = false;
	for (const arg of commandArgs) {
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		fail(`Unrecognized argument for 'gentle-shell setup': ${arg}\nRun 'gentle-shell --help' for usage.`, 2);
	}

	const pinnedVersion = resolveSetupGentleAiPin();
	if (!isSetupCapablePin(pinnedVersion)) {
		fail(
			`gentle-shell: setup needs the package-local gentle-ai v${MIN_SETUP_GENTLE_AI_VERSION} or newer (pinned: ${pinnedVersion}); this build cannot provision a home without touching ~/.pi/agent`,
			1,
		);
	}

	const binaryPath = resolveSetupGentleAiBinary();
	if (!existsSync(binaryPath)) {
		fail(new PackageLocalGentleAiBinaryMissingError(binaryPath).message, 1);
	}

	process.stderr.write(`gentle-shell: provisioning ${home.dir} with the gentle-ai companion packages\n`);

	const setupArgs = ["install", "--agent", "pi", "--scope", "global", ...(dryRun ? ["--dry-run"] : [])];
	const env = {
		...process.env,
		PI_CODING_AGENT_DIR: home.dir,
		GENTLE_PI_AGENT_HOME: home.dir,
		PATH: `${dirname(runtime.command)}${delimiter}${process.env.PATH ?? ""}`,
	};

	const launchPlan = planSpawn({ command: binaryPath, args: setupArgs, platform: process.platform });
	const child = spawn(launchPlan.command, launchPlan.args, { stdio: "inherit", env, shell: launchPlan.shell });
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
		process.on(signal, () => child.kill(signal));
	}
	child.on("error", (error) => fail(`Could not start the gentle-ai binary: ${error.message}`, 1));
	child.on("exit", (code, signal) => {
		process.exit(signal ? signalExitCode(signal) : (code ?? 1));
	});
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

	if (args.command === "setup") {
		await handleSetupCommand(args.commandArgs, home, runtime);
		return;
	}

	const packageRootExplicit = args.packageRoot !== undefined;
	const effectivePackageRoot = packageRootExplicit ? resolvePath(args.packageRoot) : packageRoot;
	// R4-forced-package-root-unvalidated / R3-005: an unvalidated --package-root
	// forces a take-over (dropping normal extension discovery via
	// --no-extensions) and then hands pi -e/--theme/--skill/--prompt-template
	// flags pointing at directories that do not exist, turning an operator typo
	// into an obscure pi loader failure instead of a clear launcher error.
	if (packageRootExplicit && !isDirectory(effectivePackageRoot)) {
		fail(`--package-root ${args.packageRoot} does not exist or is not a directory.`, 2);
	}

	let declaration;
	let takeOver = false;
	let otherPackagePaths = [];
	let looseExtensionEntries = [];

	// Every mode consults the home's own settings.json for a gentle-pi
	// declaration, not just --link: `gentle-shell setup` installs
	// npm:gentle-pi into an isolated or --home home's settings.json, and once
	// that declaration exists the launcher must stop injecting its own copy
	// on top of it (buildPiInvocation skips injection whenever a declaration
	// is present and there is no take-over). A path declaration in a
	// non-link home follows the same take-over rules as --link. A home
	// without any declaration keeps the plain injection, unchanged.
	//
	// --package-root only forces a take-over in --link mode: an isolated or
	// --home target has no pre-existing pi installation to defer to, so
	// forcing --no-extensions there would just strip its own settings-driven
	// discovery for no benefit (see the "gated on link mode" bin test). A pi
	// subcommand skips this whole block: buildPiInvocation ignores
	// takeOver/declaration once piSubcommand is set, and running the
	// take-over/loose-dir discovery anyway would still print a misleading
	// "taking over gentle-pi..." message (and otherPackageInjections
	// warnings) for a plain `gentle-shell install npm:x` that never actually
	// takes anything over.
	if (args.piSubcommand === undefined) {
		const settingsText = readJsonIfExists(join(home.dir, "settings.json"));
		declaration = findGentlePiDeclaration(settingsText, { agentDir: home.dir, readPackageName });
		// --package-root only forces a take-over in --link mode (see below);
		// in every other mode a declared home silently keeps using its
		// declared gentle-pi and --package-root has no effect at all. Warn
		// once so an operator does not assume --package-root took effect.
		if (packageRootExplicit && home.mode !== "link" && declaration !== undefined) {
			process.stderr.write(
				`gentle-shell: --package-root only forces a take-over in --link mode; ${home.dir} declares gentle-pi, so the installed package is used and ${args.packageRoot} is ignored\n`,
			);
		}
		const realEffectivePackageRoot = safeRealpath(effectivePackageRoot);
		const realDeclaredDir = declaration?.kind === "path" ? safeRealpath(declaration.dir) : undefined;
		takeOver = decideTakeOver({
			declaration,
			realPackageRoot: realEffectivePackageRoot,
			realDeclaredDir,
			packageRootExplicit: home.mode === "link" && packageRootExplicit,
		});
		if (takeOver) {
			const skip = declaration ?? { kind: "path", dir: realEffectivePackageRoot };
			const injections = otherPackageInjections({ settingsText, agentDir: home.dir, skip, isDirectory, realpath: safeRealpath });
			otherPackagePaths = injections.paths;
			for (const warning of injections.warnings) process.stderr.write(`${warning}\n`);
			// --no-extensions drops pi's normal settings-driven extension
			// discovery, which also covers loose (non-package) extensions
			// under <agentDir>/extensions and the project-local
			// <cwd>/.pi/extensions. Re-injecting either directory wholesale
			// as `-e <dir>` does not work for a directory of loose files: pi's
			// -e flag hands the path straight to its module loader with no
			// directory-discovery pass, so a bare directory of loose files
			// fails with "Cannot find module ...". Resolve each candidate
			// into its actual loose file entries (or pass it through
			// unchanged when it is itself a self-contained extension) so a
			// take-over does not silently stop loading them.
			looseExtensionEntries = [join(home.dir, "extensions"), join(process.cwd(), ".pi", "extensions")].flatMap(resolveLooseExtensionEntries);
			const declaredFrom = declaration === undefined ? "the requested package root" : declaration.kind === "npm" ? "npm:gentle-pi" : declaration.dir;
			process.stderr.write(
				`gentle-shell: taking over gentle-pi from ${declaredFrom} for this run (settings unchanged; its skills, prompts, and themes still load alongside this launcher's).\n`,
			);
		}
	}

	const invocation = buildPiInvocation({
		runtime,
		home,
		packageRoot: effectivePackageRoot,
		declaration,
		takeOver,
		otherPackagePaths,
		looseExtensionEntries,
		passthrough: args.passthrough,
		piSubcommand: args.piSubcommand,
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
