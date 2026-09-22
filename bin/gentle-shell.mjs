#!/usr/bin/env node
// Thin process/fs/exec glue around lib/gentle-shell-launcher.ts (built to
// runtime/gentle-shell-launcher.mjs). All decision logic — argv parsing, home
// resolution, pi resolution order, the version gate, and the pi invocation —
// lives in that pure, unit-tested module; this file only wires it to the real
// process, filesystem, and child process.
import {
	accessSync,
	closeSync,
	constants as fsConstants,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
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
	homeSelectorFlags,
	isSetupCapablePin,
	launcherConfigPath,
	MIN_SETUP_GENTLE_AI_VERSION,
	missingPiMessage,
	needsProvisioning,
	otherPackageInjections,
	parseLauncherArgs,
	parseLauncherConfig,
	parseRawLauncherConfig,
	planSpawn,
	POST_INSTALL_REMOVAL_SOURCES,
	postInstallRemovals,
	provisionedEntry,
	recordProvisioned,
	resolveHome,
	resolvePiRuntime,
	shellQuote,
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

// Test/development-only override for the launcher config.json path
// (normally launcherConfigPath(homedir())). Lets a test — or the
// packed-artifact E2E script, which also needs `--link` probes against the
// real pi home and so cannot just redirect HOME wholesale — read and write
// the `home` subcommand's and the auto-provisioning marker's config file
// without ever touching the real ~/.gentle-shell/config.json. Never
// consulted outside these two call sites; see docs/readme-reference.md.
function resolveConfigPath() {
	const override = process.env.GENTLE_SHELL_CONFIG;
	return override !== undefined && override.length > 0 ? override : launcherConfigPath(homedir());
}

// Raw config.json as a plain object (see RawLauncherConfig in
// lib/gentle-shell-launcher.ts): unlike parseLauncherConfig, this preserves
// every key, so a write (home persistence, or the provisioning marker below)
// never drops a key it does not itself understand.
function readRawConfig(configPath) {
	return parseRawLauncherConfig(readJsonIfExists(configPath));
}

function writeRawConfig(configPath, config) {
	const configDir = dirname(configPath);
	if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true, mode: 0o700 });
	writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function loadConfig() {
	const text = readJsonIfExists(resolveConfigPath());
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

	const configPath = resolveConfigPath();
	const existing = readRawConfig(configPath);

	if (value === "link" || value === "isolated") {
		writeRawConfig(configPath, { ...existing, home: value });
		process.stdout.write(`Saved home: ${value}\n`);
		process.exit(0);
	}
	const dir = resolvePath(value);
	writeRawConfig(configPath, { ...existing, home: dir });
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

const SKIP_GENTLE_AI_INSTALL_ENV = "GENTLE_PI_SKIP_GENTLE_AI_INSTALL";

// Test/development-only override for the setup subcommand's self-heal
// installer script path. Lets a test point at a stub installer (one that
// creates the stub binary, or deliberately doesn't) instead of running the
// real node scripts/install-gentle-ai.mjs, whose supply-chain integrity
// checks (and real network download) a test cannot cheaply satisfy. Never
// consulted outside `setup`; see docs/readme-reference.md.
function resolveSetupGentleAiInstaller() {
	const override = process.env.GENTLE_SHELL_GENTLE_AI_INSTALLER;
	return override !== undefined && override.length > 0 ? override : join(packageRoot, "scripts", "install-gentle-ai.mjs");
}

// Spawns `command` and resolves once it exits, instead of exiting the
// process directly: the shared core the manual `setup` subcommand and the
// automatic first-run provisioning flow (S7) both drive, deciding for
// themselves whether to `process.exit` (setup) or warn and continue (auto
// mode). `stdio` lets a silent caller route the child's stdout/stderr to the
// launcher's own stderr (see runSetupFlow) while a manual `setup` keeps the
// child's stdio inherited. A `signal` on the result (rather than folding it
// into a plain non-zero exit) lets a caller skip printing remediation advice
// for a process this launcher itself killed — never a real failure to
// diagnose.
function spawnAndWait(command, args, env, stdio) {
	return new Promise((resolve) => {
		const launchPlan = planSpawn({ command, args, platform: process.platform });
		const child = spawn(launchPlan.command, launchPlan.args, { stdio, env, shell: launchPlan.shell });
		const signalHandlers = ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => {
			const handler = () => child.kill(signal);
			process.on(signal, handler);
			return [signal, handler];
		});
		const cleanup = () => {
			for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
		};
		child.on("error", (error) => {
			cleanup();
			resolve({ ok: false, exitCode: 1, error });
		});
		child.on("exit", (code, signal) => {
			cleanup();
			if (signal) {
				resolve({ ok: false, exitCode: signalExitCode(signal), signal });
				return;
			}
			const exitCode = code ?? 1;
			resolve({ ok: exitCode === 0, exitCode });
		});
	});
}

// Self-heals a missing package-local gentle-ai binary before the setup flow
// gives up on it. `npm install -g <tarball>` on a machine whose npm config
// disables lifecycle scripts (`ignore-scripts=true`, this maintainer's own
// machine included) never runs the package's own postinstall
// (scripts/install-gentle-ai.mjs), so .gentle-ai/v<pin>/gentle-ai is missing
// even though the package itself installed fine. Running that same
// installer here recovers it: it downloads the pinned, sha256-verified
// release asset, exactly as postinstall would have. Skipped when
// GENTLE_PI_SKIP_GENTLE_AI_INSTALL is "1" — the same variable that already
// controls whether real postinstall provisioning runs (see
// docs/readme-reference.md) — in which case today's plain missing-binary
// failure is kept, with the variable named in the message. Returns
// {ok, exitCode, message} instead of exiting the process, so the caller
// decides whether to exit (manual setup) or warn and continue (auto mode).
function ensurePackageLocalGentleAi(binaryPath, pinnedVersion, stdio) {
	if (existsSync(binaryPath)) return { ok: true };
	if (process.env[SKIP_GENTLE_AI_INSTALL_ENV] === "1") {
		return {
			ok: false,
			exitCode: 1,
			message: `${new PackageLocalGentleAiBinaryMissingError(binaryPath).message} (${SKIP_GENTLE_AI_INSTALL_ENV} is set; not installing it automatically)`,
		};
	}
	process.stderr.write(
		`gentle-shell: the package-local gentle-ai v${pinnedVersion} is missing (npm lifecycle scripts may be disabled); installing it now\n`,
	);
	const installerPath = resolveSetupGentleAiInstaller();
	const result = spawnSync(process.execPath, [installerPath], { stdio });
	if (result.error) {
		return { ok: false, exitCode: 1, message: `Could not run the gentle-ai installer at ${installerPath}: ${result.error.message}` };
	}
	if (!existsSync(binaryPath)) return { ok: false, exitCode: 1, message: new PackageLocalGentleAiBinaryMissingError(binaryPath).message };
	return { ok: true };
}

// Shared env for the gentle-ai install spawn and the pi remove cleanup spawn
// below: PI_CODING_AGENT_DIR/GENTLE_PI_AGENT_HOME point both at the resolved
// home, and the resolved pi runtime's directory is prepended to PATH so
// gentle-ai's (or pi's own) preflight finds `pi` even when it is bundled or
// given through GENTLE_SHELL_PI.
function buildSetupEnv(home, runtime) {
	return {
		...process.env,
		PI_CODING_AGENT_DIR: home.dir,
		GENTLE_PI_AGENT_HOME: home.dir,
		PATH: `${dirname(runtime.command)}${delimiter}${process.env.PATH ?? ""}`,
	};
}

// Provisions `home` with everything `gentle-ai install --agent pi` installs
// into a regular Pi, by spawning the package-local pinned gentle-ai binary
// (never a PATH `gentle-ai`) with PI_CODING_AGENT_DIR/GENTLE_PI_AGENT_HOME set
// to `home.dir` and the resolved pi runtime's directory prepended to PATH, so
// gentle-ai's own preflight finds `pi` even when it is bundled or given
// through GENTLE_SHELL_PI, then removes any conflicting package it declared
// (see runSetupConflictCleanup below). `home` and `runtime` are resolved by
// the caller exactly as a normal run resolves them (including the
// isolated/--home bootstrap and the pi version gate). Precondition: the
// package-local gentle-ai pin must be at least MIN_SETUP_GENTLE_AI_VERSION —
// the first release that honors PI_CODING_AGENT_DIR here — or this refuses
// to spawn it, since an older pin would silently provision the caller's real
// ~/.pi/agent.
//
// Returns {ok, exitCode, message?} instead of exiting the process: the
// manual `setup` subcommand (handleSetupCommand) exits on the result, and
// the automatic first-run flow (maybeAutoProvisionHome, S7) warns and
// continues the launch on failure instead. `stdio` is threaded through to
// both child spawns unchanged (see spawnAndWait and
// ensurePackageLocalGentleAi above) — "inherit" for a manual `setup`, or
// `["ignore", 2, 2]` in auto mode so every child's stdout/stderr lands on
// this launcher's own stderr and its real stdout stays clean for `--mode
// rpc`/`-p` consumers.
// The shared Pi persona file gentle-ai writes on every install, regardless
// of the target home: its own PiPersonaConfigPath always resolves against
// the OS home, never PI_CODING_AGENT_DIR (gentle-ai internal/components/persona/inject.go),
// so a `setup` run for any home silently resets whatever persona mode the
// user already chose back to gentle-ai's default preset unless something
// snapshots and restores it. See snapshotFile/restoreFile below and
// docs/readme-reference.md's setup "Known limitation".
function sharedPersonaPath() {
	return join(homedir(), ".pi", "gentle-ai", "persona.json");
}

// Records `path`'s current state before a child process that might rewrite
// it runs: whether it exists, and if so its exact bytes and mode. Returns
// `{ path, existed: false }` for a missing file so restoreFile below knows
// to delete rather than rewrite it. Any error other than "does not exist"
// propagates — a snapshot that silently treats a permissions error as
// "missing" would then delete a file it never actually read.
function snapshotFile(path) {
	try {
		const bytes = readFileSync(path);
		const mode = statSync(path).mode & 0o777;
		return { path, existed: true, bytes, mode };
	} catch (error) {
		if (error.code === "ENOENT") return { path, existed: false };
		throw error;
	}
}

// Restores `snapshot` after the child that might have rewritten it exits,
// but only when its current state actually differs from what was recorded:
// a changed existing file is rewritten atomically (temp file in the same
// directory, then renamed, so a crash mid-restore never leaves a partial
// file) preserving the original mode; a file that did not exist before is
// removed if the child created one. Returns true when a restore/removal
// actually happened, so the caller prints exactly one notice.
function restoreFile(snapshot) {
	const { path, existed } = snapshot;
	if (!existed) {
		if (!existsSync(path)) return false;
		rmSync(path, { force: true });
		return true;
	}
	let currentBytes;
	try {
		currentBytes = readFileSync(path);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	if (currentBytes !== undefined && currentBytes.equals(snapshot.bytes)) return false;
	mkdirSync(dirname(path), { recursive: true });
	const tempPath = join(dirname(path), `.${basenameOf(path)}.gentle-shell-restore-${process.pid}.tmp`);
	writeFileSync(tempPath, snapshot.bytes, { mode: snapshot.mode });
	renameSync(tempPath, path);
	return true;
}

function basenameOf(path) {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1];
}

async function runSetupFlow(home, runtime, { dryRun, stdio }) {
	const pinnedVersion = resolveSetupGentleAiPin();
	if (!isSetupCapablePin(pinnedVersion)) {
		return {
			ok: false,
			exitCode: 1,
			message: `gentle-shell: setup needs the package-local gentle-ai v${MIN_SETUP_GENTLE_AI_VERSION} or newer (pinned: ${pinnedVersion}); this build cannot provision a home without touching ~/.pi/agent`,
		};
	}

	const binaryPath = resolveSetupGentleAiBinary();
	const ensured = ensurePackageLocalGentleAi(binaryPath, pinnedVersion, stdio);
	if (!ensured.ok) return ensured;

	process.stderr.write(`gentle-shell: provisioning ${home.dir} with the gentle-ai companion packages\n`);

	const setupArgs = ["install", "--agent", "pi", "--scope", "global", ...(dryRun ? ["--dry-run"] : [])];
	const env = buildSetupEnv(home, runtime);
	const personaPath = sharedPersonaPath();
	const personaSnapshot = snapshotFile(personaPath);
	let installResult;
	try {
		installResult = await spawnAndWait(binaryPath, setupArgs, env, stdio);
	} finally {
		if (restoreFile(personaSnapshot)) {
			process.stderr.write(`gentle-shell: kept your Pi persona unchanged (gentle-ai rewrote ${personaPath}; tracked upstream)\n`);
		}
	}
	if (installResult.error) {
		return { ok: false, exitCode: 1, message: `Could not start the gentle-ai binary: ${installResult.error.message}` };
	}
	if (!installResult.ok) return installResult;

	return runPostInstallCleanup(home, runtime, dryRun, stdio);
}

// The stderr line printed once `source` is actually removed from `home`.
// npm:gentle-pi names the running launcher's own version, so it is
// self-evident which copy stays authoritative; every other source keeps its
// original gentle-ai #4820 wording unchanged.
function postInstallRemovingMessage(source, home) {
	if (source === "npm:gentle-pi") {
		return `gentle-shell: removing ${source} from ${home.dir}: this launcher loads its own gentle-pi ${ownPackageVersion()}, so the home always matches it`;
	}
	return `gentle-shell: removing ${source} from ${home.dir}: gentle-pi ships ask_user_question and Pi refuses two providers (gentle-ai #4820)`;
}

// The --dry-run stderr line for `source`, printed unconditionally (see
// runPostInstallCleanup below). Kept byte-identical to the pre-existing
// rpiv wording; npm:gentle-pi gets its own analogous "would remove" line.
function postInstallWouldRemoveMessage(source) {
	if (source === "npm:gentle-pi") {
		return `gentle-shell: setup would then remove ${source} if the install declares it: this launcher loads its own gentle-pi ${ownPackageVersion()}, so the home always matches it`;
	}
	return `gentle-shell: setup would then remove ${source} if the install declares it (gentle-ai #4820)`;
}

// Runs once the gentle-ai install spawned by runSetupFlow above has exited
// 0. gentle-ai's managed Pi stack always declares two packages this launcher
// must remove from the just-provisioned home itself, unless this is a
// --dry-run: npm:@juicesharp/rpiv-ask-user-question, which conflicts with
// gentle-pi's own first-party ask_user_question tool (Pi refuses two
// providers for the same tool name; gentle-ai #4820, gentle-shell #1277,
// fix pending upstream), and npm:gentle-pi itself, which must never survive
// setup — this launcher always loads its own gentle-pi, never the one
// gentle-ai's stack installs. A --dry-run gentle-ai install writes nothing,
// so settings.json read afterwards would only report whatever pre-existed
// the run (e.g. the isolated-home bootstrap), never what the skipped
// install would have declared; report every known removal source
// unconditionally instead of reading settings.json at all.
async function runPostInstallCleanup(home, runtime, dryRun, stdio) {
	if (dryRun) {
		for (const source of POST_INSTALL_REMOVAL_SOURCES) {
			process.stderr.write(`${postInstallWouldRemoveMessage(source)}\n`);
		}
		return { ok: true, exitCode: 0 };
	}
	const settingsText = readJsonIfExists(join(home.dir, "settings.json"));
	const removals = postInstallRemovals(settingsText);
	if (removals.length === 0) return { ok: true, exitCode: 0 };
	return removePostInstallSources(removals, 0, home, runtime, stdio);
}

// Removes each declared post-install source in turn via the resolved pi
// runtime itself (never gentle-ai), stopping at the first failure so its
// exit code and actionable message are not masked by a later removal.
async function removePostInstallSources(sources, index, home, runtime, stdio) {
	if (index >= sources.length) return { ok: true, exitCode: 0 };
	const source = sources[index];
	process.stderr.write(`${postInstallRemovingMessage(source, home)}\n`);
	const env = buildSetupEnv(home, runtime);
	const result = await spawnAndWait(runtime.command, [...runtime.args, "remove", source], env, stdio);
	if (result.error) {
		return { ok: false, exitCode: 1, message: `Could not run the pi runtime to remove ${source}: ${result.error.message}` };
	}
	if (!result.ok) {
		if (result.signal) return result;
		const remediation = [...homeSelectorFlags(home).map(shellQuote), "remove", source].join(" ");
		return { ok: false, exitCode: result.exitCode, message: `gentle-shell: could not remove ${source}; run \`gentle-shell ${remediation}\` before starting` };
	}
	return removePostInstallSources(sources, index + 1, home, runtime, stdio);
}

// CLI entry for `gentle-shell [home selectors] setup [--dry-run]`: parses
// --dry-run, runs the shared flow with the child's stdio inherited (today's
// behavior, unchanged), then exits with its result — this is the one place
// that keeps the pre-S7 exit semantics `handleSetupCommand` always had.
async function handleSetupCommand(commandArgs, home, runtime) {
	let dryRun = false;
	for (const arg of commandArgs) {
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		fail(`Unrecognized argument for 'gentle-shell setup': ${arg}\nRun 'gentle-shell --help' for usage.`, 2);
	}

	const result = await runSetupFlow(home, runtime, { dryRun, stdio: "inherit" });
	if (!result.ok && result.message !== undefined) process.stderr.write(`${result.message}\n`);
	process.exit(result.exitCode);
}

const AUTO_SETUP_OPT_OUT_ENV = "GENTLE_SHELL_NO_AUTO_SETUP";
const SETUP_LOCK_STALE_MS = 15 * 60 * 1000;

// Guards concurrent first-run auto-provisioning of the same home: an
// exclusive create (`wx`) fails when the lock already exists. A lock file
// younger than SETUP_LOCK_STALE_MS means another gentle-shell process is (or
// very recently was) provisioning this home, so this run skips
// auto-provisioning entirely rather than racing gentle-ai's own installer;
// the existing lock is left untouched since this run never owned it. An
// older lock is stale — a previous run crashed or was killed before its
// `finally` released it — so it is removed here and acquisition retried.
// Any unexpected fs error (permissions, a vanished lock between the EEXIST
// and the stat, …) must never block the launch, so it resolves to "proceed"
// rather than failing closed.
function acquireSetupLock(lockPath) {
	try {
		closeSync(openSync(lockPath, "wx"));
		return true;
	} catch (error) {
		if (error.code !== "EEXIST") return true;
		let age;
		try {
			age = Date.now() - statSync(lockPath).mtimeMs;
		} catch {
			return true;
		}
		if (age < SETUP_LOCK_STALE_MS) {
			process.stderr.write(
				`gentle-shell: another gentle-shell process is already provisioning ${dirname(lockPath)}; skipping automatic setup for this run\n`,
			);
			return false;
		}
		try {
			rmSync(lockPath, { force: true });
		} catch {
			return false;
		}
		return acquireSetupLock(lockPath);
	}
}

function releaseSetupLock(lockPath) {
	try {
		rmSync(lockPath, { force: true });
	} catch {
		// Best-effort cleanup only: a missing or unremovable lock file must
		// never fail an otherwise-successful (or already-failed) run.
	}
}

// Runs the same flow as `gentle-shell setup` automatically before a plain
// launch, for an isolated or `--home <path>` home that was never provisioned
// or was provisioned with a different gentle-ai pin (S7). Never runs for
// `--link` (the caller only calls this for home.mode "isolated"/"path") or a
// pi subcommand (the caller only calls this when args.piSubcommand is
// undefined) — see main() below. Never blocks the launch: a failure (an
// older pin, a missing binary the self-heal could not recover, a non-zero
// gentle-ai or pi exit) only warns and lets the plain launch continue with
// today's injection behavior, to retry automatically on a later run.
async function maybeAutoProvisionHome(home, runtime) {
	if (process.env[AUTO_SETUP_OPT_OUT_ENV] === "1") return;

	const configPath = resolveConfigPath();
	const homeKey = safeRealpath(home.dir);
	const pin = resolveSetupGentleAiPin();
	const gentlePiVersion = ownPackageVersion();
	const beforeConfig = readRawConfig(configPath);
	if (!needsProvisioning(beforeConfig, homeKey, pin, gentlePiVersion)) return;

	const lockPath = join(home.dir, ".gentle-shell-setup.lock");
	if (!acquireSetupLock(lockPath)) return;

	try {
		const previous = provisionedEntry(beforeConfig, homeKey);
		if (previous === undefined) {
			process.stderr.write(
				`gentle-shell: first run in ${home.dir}: installing the Gentle AI companion packages (one time; set ${AUTO_SETUP_OPT_OUT_ENV}=1 to skip)\n`,
			);
		} else {
			// A marker written before gentle-pi version tracking existed (S8)
			// has no `gentlePi` field: needsProvisioning above already treats
			// that as changed, so this reports "unknown" as its prior value
			// instead of "undefined".
			const gentleAiChanged = previous.gentleAi !== pin;
			const gentlePiChanged = previous.gentlePi !== gentlePiVersion;
			if (gentleAiChanged && gentlePiChanged) {
				process.stderr.write(
					`gentle-shell: gentle-ai pin changed (${previous.gentleAi} -> ${pin}) and gentle-pi changed (${previous.gentlePi ?? "unknown"} -> ${gentlePiVersion}): updating ${home.dir}\n`,
				);
			} else if (gentlePiChanged) {
				process.stderr.write(`gentle-shell: gentle-pi changed (${previous.gentlePi ?? "unknown"} -> ${gentlePiVersion}): updating ${home.dir}\n`);
			} else {
				process.stderr.write(`gentle-shell: gentle-ai pin changed (${previous.gentleAi} -> ${pin}): updating ${home.dir}\n`);
			}
		}

		const result = await runSetupFlow(home, runtime, { dryRun: false, stdio: ["ignore", 2, 2] });
		if (!result.ok) {
			const remediation = [...homeSelectorFlags(home).map(shellQuote), "setup"].join(" ");
			process.stderr.write(
				`gentle-shell: automatic setup failed (exit ${result.exitCode}); starting anyway and retrying next run. Run \`gentle-shell ${remediation}\` to see the full output.\n`,
			);
			return;
		}

		writeRawConfig(configPath, recordProvisioned(readRawConfig(configPath), homeKey, pin, gentlePiVersion, new Date().toISOString()));
	} finally {
		releaseSetupLock(lockPath);
	}
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

	// Auto-provision (S7): a plain launch against an isolated or --home home
	// (never --link) runs the same flow as `gentle-shell setup` automatically
	// before pi starts, so the maintainer's own packages install without ever
	// needing to know `setup` exists. Skipped for a pi subcommand
	// (`gentle-shell install/remove/list/...`) — argv[0] must stay the bare
	// subcommand for pi to dispatch it, same reason the declaration/take-over
	// block below skips it. Must run before that block reads settings.json,
	// so a freshly provisioned home's npm:gentle-pi declaration is honored by
	// this same launch instead of only starting from the next one.
	if ((home.mode === "isolated" || home.mode === "path") && args.piSubcommand === undefined) {
		await maybeAutoProvisionHome(home, runtime);
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
