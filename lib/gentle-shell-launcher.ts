import { join } from "node:path";

// The gentle-shell launcher: pure, side-effect-free functions over injected
// env/fs/exec. `bin/gentle-shell.mjs` (T2) wires these into the real process,
// filesystem and child process so this module stays fully unit-testable.

export type LauncherCommand = "home";

export interface ParsedLauncherArgs {
	link: boolean;
	isolated: boolean;
	home?: string;
	help: boolean;
	version: boolean;
	command?: LauncherCommand;
	commandArgs: string[];
	passthrough: string[];
	error?: string;
}

// Home-subcommand parsing is deliberately shallow: `home` only counts as the
// subcommand when it is argv[0], and everything after it is handed over
// untouched as commandArgs — T2 owns interpreting `home link|isolated|<path>`.
export function parseLauncherArgs(argv: string[]): ParsedLauncherArgs {
	if (argv[0] === "home") {
		return {
			link: false,
			isolated: false,
			home: undefined,
			help: false,
			version: false,
			command: "home",
			commandArgs: argv.slice(1),
			passthrough: [],
			error: undefined,
		};
	}

	let link = false;
	let isolated = false;
	let home: string | undefined;
	let help = false;
	let version = false;
	let error: string | undefined;
	const passthrough: string[] = [];

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--") {
			passthrough.push(...argv.slice(i + 1));
			break;
		}
		if (arg === "--link") {
			link = true;
			continue;
		}
		if (arg === "--isolated") {
			isolated = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}
		if (arg === "--version") {
			version = true;
			continue;
		}
		if (arg.startsWith("--home=")) {
			const value = arg.slice("--home=".length);
			if (value.length === 0) {
				error = "--home requires a non-empty path argument";
				continue;
			}
			home = value;
			continue;
		}
		if (arg === "--home") {
			const value = argv[i + 1];
			if (value === undefined || value.length === 0) {
				error = "--home requires a non-empty path argument";
				if (value !== undefined) i += 1;
				continue;
			}
			home = value;
			i += 1;
			continue;
		}
		passthrough.push(arg);
	}

	if (error === undefined) {
		if (link && isolated) {
			error = "--link cannot be combined with --isolated";
		} else if (link && home !== undefined) {
			error = "--link cannot be combined with --home";
		} else if (isolated && home !== undefined) {
			error = "--isolated cannot be combined with --home";
		}
	}

	return { link, isolated, home, help, version, command: undefined, commandArgs: [], passthrough, error };
}

// --- home resolution -------------------------------------------------------

export type HomeMode = "link" | "isolated" | "path";
export type HomeSource = "flag" | "config" | "default";

export interface ResolvedHome {
	mode: HomeMode;
	dir: string;
	source: HomeSource;
}

// A discriminated union instead of a plain `home: string` field: `resolveHome`
// switches on `mode` rather than re-parsing the raw on-disk string, and the
// `path` case carries its `dir` explicitly so a "link"/"isolated" string can
// never be mistaken for a filesystem path at the call site.
export type LauncherConfig = { mode: "link" } | { mode: "isolated" } | { mode: "path"; dir: string };

export interface ResolveHomeInput {
	args: ParsedLauncherArgs;
	env: Record<string, string | undefined>;
	homedir: string;
	config: LauncherConfig | undefined;
}

// Pi Subagents resolves `PI_CODING_AGENT_DIR || ~/.pi/agent`; `--link` reuses
// that exact home so gentle-shell never diverges from the user's own pi.
function linkDir(env: Record<string, string | undefined>, homedir: string): string {
	return env.PI_CODING_AGENT_DIR || join(homedir, ".pi", "agent");
}

function isolatedDir(env: Record<string, string | undefined>, homedir: string): string {
	return env.GENTLE_SHELL_HOME || join(homedir, ".gentle-shell", "agent");
}

export function resolveHome(input: ResolveHomeInput): ResolvedHome {
	const { args, env, homedir, config } = input;

	if (args.link) return { mode: "link", dir: linkDir(env, homedir), source: "flag" };
	if (args.isolated) return { mode: "isolated", dir: isolatedDir(env, homedir), source: "flag" };
	if (args.home !== undefined) return { mode: "path", dir: args.home, source: "flag" };

	if (config !== undefined) {
		if (config.mode === "link") return { mode: "link", dir: linkDir(env, homedir), source: "config" };
		if (config.mode === "isolated") return { mode: "isolated", dir: isolatedDir(env, homedir), source: "config" };
		return { mode: "path", dir: config.dir, source: "config" };
	}

	return { mode: "isolated", dir: isolatedDir(env, homedir), source: "default" };
}

export function launcherConfigPath(homedir: string): string {
	return join(homedir, ".gentle-shell", "config.json");
}

// Tolerant on purpose: a malformed or foreign config.json must never crash
// the launcher, it just falls through to the default isolated home.
//
// The on-disk shape stays the flat `{ "home": "link" | "isolated" | "<path>" }`
// documented in the feature scope; only the parsed, in-memory `LauncherConfig`
// is a discriminated union. Any non-empty string other than the exact literals
// "link" or "isolated" is treated as a path, including a near-miss like
// "linked" — this is deliberate: there is no separate "unrecognised mode"
// error, a typo just resolves to a (probably nonexistent) path instead.
export function parseLauncherConfig(text: string): LauncherConfig | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
	const home = (parsed as Record<string, unknown>).home;
	if (typeof home !== "string" || home.length === 0) return undefined;
	if (home === "link") return { mode: "link" };
	if (home === "isolated") return { mode: "isolated" };
	return { mode: "path", dir: home };
}

// --- pi runtime resolution ---------------------------------------------------

export type PiRuntimeKind = "env" | "bundled" | "path";

export interface PiRuntime {
	kind: PiRuntimeKind;
	command: string;
	args: string[];
}

export interface PiRuntimeDeps {
	env: Record<string, string | undefined>;
	resolveBundledCli: () => string | undefined;
	findOnPath: (name: string) => string | undefined;
	nodeExecPath: string;
}

export function resolvePiRuntime(deps: PiRuntimeDeps): PiRuntime | undefined {
	const envOverride = deps.env.GENTLE_SHELL_PI;
	if (envOverride !== undefined && envOverride.length > 0) return { kind: "env", command: envOverride, args: [] };

	const bundledCliPath = deps.resolveBundledCli();
	if (bundledCliPath !== undefined) return { kind: "bundled", command: deps.nodeExecPath, args: [bundledCliPath] };

	const onPath = deps.findOnPath("pi");
	if (onPath !== undefined) return { kind: "path", command: onPath, args: [] };

	return undefined;
}

export function missingPiMessage(): string {
	return [
		"No pi runtime could be found. Pick one of:",
		"  - Set GENTLE_SHELL_PI to the path of a pi executable.",
		"  - Install @earendil-works/pi-coding-agent next to gentle-pi (it ships as an optional peer dependency).",
		"  - Install pi and make sure it is on your PATH.",
	].join("\n");
}

// --- pi version gate ---------------------------------------------------------

export const MIN_PI_VERSION = "0.85.1";

export type PiVersionCheck = { ok: true; version: string } | { ok: false; message: string; version?: string };

const VERSION_PATTERN = /v?(\d+)\.(\d+)\.(\d+)/;

function compareVersions(a: readonly [number, number, number], b: readonly [number, number, number]): number {
	for (let i = 0; i < 3; i += 1) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return 0;
}

export function checkPiVersion(output: string, minimum: string = MIN_PI_VERSION): PiVersionCheck {
	const match = VERSION_PATTERN.exec(output);
	if (!match) {
		return { ok: false, message: `Could not determine the pi version from "${output.trim()}" (need at least ${minimum}).` };
	}
	const version = `${match[1]}.${match[2]}.${match[3]}`;
	const minimumMatch = VERSION_PATTERN.exec(minimum);
	if (!minimumMatch) throw new Error(`invalid minimum version "${minimum}"`);
	const found: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const wanted: [number, number, number] = [Number(minimumMatch[1]), Number(minimumMatch[2]), Number(minimumMatch[3])];
	if (compareVersions(found, wanted) < 0) {
		return { ok: false, version, message: `pi version ${version} is older than the required minimum ${minimum}.` };
	}
	return { ok: true, version };
}

// --- packaging drift guard -----------------------------------------------------

export interface PackageJsonPeerShape {
	peerDependencies?: Record<string, string>;
}

export type PeerVersionPinCheck = { ok: true; pinned: string } | { ok: false; message: string };

// Keeps the MIN_PI_VERSION drift-guard test's failure readable: a missing
// peerDependencies block, a missing peer entry, or a malformed range must
// fail with a clear assertion message, not a raw TypeError from indexing an
// undefined value the way a direct `packageJson.peerDependencies[peerName]`
// lookup would.
export function checkPeerVersionPin(packageJson: PackageJsonPeerShape, peerName: string, minVersion: string): PeerVersionPinCheck {
	const peerDependencies = packageJson.peerDependencies;
	if (peerDependencies === undefined) {
		return { ok: false, message: "package.json is missing a peerDependencies block" };
	}
	const pinned = peerDependencies[peerName];
	if (typeof pinned !== "string") {
		return { ok: false, message: `package.json peerDependencies is missing "${peerName}"` };
	}
	if (!/^>=\d+\.\d+\.\d+$/.test(pinned)) {
		return { ok: false, message: `package.json peerDependencies["${peerName}"] ("${pinned}") is not a simple >=x.y.z range` };
	}
	const version = pinned.replace(/^>=/, "");
	if (version !== minVersion) {
		return { ok: false, message: `MIN_PI_VERSION ("${minVersion}") does not match the pinned peer range ("${pinned}")` };
	}
	return { ok: true, pinned };
}

// --- settings.json detection ---------------------------------------------------

function packageEntryDeclaresGentlePi(entry: unknown): boolean {
	const declares = (value: unknown): boolean => typeof value === "string" && (value === "npm:gentle-pi" || value.startsWith("npm:gentle-pi@"));
	if (declares(entry)) return true;
	if (entry !== null && typeof entry === "object") return declares((entry as Record<string, unknown>).source);
	return false;
}

export function settingsDeclareGentlePi(settingsText: string | undefined): boolean {
	if (settingsText === undefined) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(settingsText);
	} catch {
		return false;
	}
	if (typeof parsed !== "object" || parsed === null) return false;
	const packages = (parsed as Record<string, unknown>).packages;
	if (!Array.isArray(packages)) return false;
	return packages.some(packageEntryDeclaresGentlePi);
}

// --- pi invocation builder ---------------------------------------------------

export interface BuildPiInvocationInput {
	runtime: PiRuntime;
	home: ResolvedHome;
	packageRoot: string;
	settingsDeclareGentlePi: boolean;
	passthrough: string[];
	baseEnv: Record<string, string | undefined>;
}

export interface PiInvocation {
	command: string;
	args: string[];
	env: Record<string, string | undefined>;
}

// The `-e/--theme/--skill/--prompt-template` injection is skipped only when
// the caller already confirmed the target settings.json declares the
// package (the `--link` case with a pi-managed install). Isolated and path
// homes never declare it, so callers pass `settingsDeclareGentlePi: false`
// for those and the injection always happens there.
export function buildPiInvocation(input: BuildPiInvocationInput): PiInvocation {
	const args = [...input.runtime.args];
	if (!input.settingsDeclareGentlePi) {
		args.push(
			"-e",
			input.packageRoot,
			"--theme",
			join(input.packageRoot, "themes"),
			"--skill",
			join(input.packageRoot, "skills"),
			"--prompt-template",
			join(input.packageRoot, "prompts"),
		);
	}
	args.push(...input.passthrough);

	return {
		command: input.runtime.command,
		args,
		env: { ...input.baseEnv, PI_CODING_AGENT_DIR: input.home.dir, GENTLE_PI_AGENT_HOME: input.home.dir },
	};
}

// --- spawn planning ------------------------------------------------------------

// R3-001: `findOnPath` can resolve a PATHEXT candidate such as a .CMD or .BAT
// shim on win32 (exactly how an npm-installed `pi` lands on PATH), and a
// GENTLE_SHELL_PI override can point at one too. Current Node releases refuse
// to spawn a batch file directly without `shell: true` (EINVAL), so both the
// version probe and the real launch route a batch shim through cmd.exe as one
// quoted command line instead of spawning it directly.
const CMD_EXE_SPECIAL_CHARS = /[\s"&|<>^%()]/;

// cmd.exe quoting is deliberately simple, not a full cmd.exe parser: wrap a
// token in double quotes when it is empty or contains whitespace or any of
// `"&|<>^%()`, and escape an inner `"` as `\"` — doubling inner quotes is not
// reliable in cmd.exe, unlike the `\"` convention Node's own Windows spawn
// helpers use.
export function quoteForCmdExe(token: string): string {
	if (token.length > 0 && !CMD_EXE_SPECIAL_CHARS.test(token)) return token;
	return `"${token.replace(/"/g, '\\"')}"`;
}

export interface PlanSpawnInput {
	command: string;
	args: string[];
	platform: NodeJS.Platform;
}

export interface SpawnPlan {
	command: string;
	args: string[];
	shell: boolean;
}

export function planSpawn(input: PlanSpawnInput): SpawnPlan {
	const { command, args, platform } = input;
	if (platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
		return { command: [command, ...args].map(quoteForCmdExe).join(" "), args: [], shell: true };
	}
	return { command, args, shell: false };
}

// --- reporting ---------------------------------------------------------------

export interface DescribeVersionInput {
	gentlePiVersion: string;
	piVersion: string | undefined;
	home: ResolvedHome;
}

export function describeVersion(input: DescribeVersionInput): string {
	return [
		`gentle-shell ${input.gentlePiVersion}`,
		`pi ${input.piVersion ?? "not found"}`,
		`home ${input.home.mode} ${input.home.dir}`,
	].join("\n");
}

export function helpText(): string {
	return [
		"Usage: gentle-shell [options] [-- pi-args...]",
		"       gentle-shell home [link|isolated|<path>]",
		"",
		"Opens pi with the Gentle Shell package loaded, without touching your",
		"vanilla pi installation.",
		"",
		"Options:",
		"  --link           Use your existing pi agent home (never edits its settings.json).",
		"  --isolated       Use the dedicated ~/.gentle-shell/agent home (default).",
		"  --home <path>    Use a custom agent home directory.",
		"  --help, -h       Show this help text.",
		"  --version        Show gentle-shell, pi, and home version information.",
		"",
		"Commands:",
		"  home             Print or persist the effective home mode (link, isolated, or a path).",
		"",
		"Environment variables:",
		"  GENTLE_SHELL_PI       Path to the pi executable to run.",
		"  GENTLE_SHELL_HOME     Directory for the isolated home (default: ~/.gentle-shell/agent).",
		"  PI_CODING_AGENT_DIR   Directory for the --link home, shared with pi itself.",
		"",
		"Every other argument is forwarded to pi unchanged.",
	].join("\n");
}
