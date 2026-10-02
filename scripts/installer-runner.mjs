import { readFileSync } from "node:fs";
import { posix, win32 } from "node:path";
import {
	gentleAiBinaryPath,
	gentleAiDevBinaryOverrideConfigured,
	resolveGentleAiBinary,
} from "../runtime/gentle-ai-binary.mjs";
import { pnpmGlobalBin, requirements } from "./installer-preflight.mjs";

// Standard installation runner: one fixed, consented global pnpm installation
// of Pi plus gentle-pi, then the public `gentle-shell setup`. Every adapter is
// injected by trusted local code; requests carry no commands, URLs, roots or env.

/** Pi version installed next to gentle-pi (optional peer, resolved in one add). */
export const PI_INSTALL_VERSION = "1.0.0";
const PI_PACKAGE = "@earendil-works/pi-coding-agent";
const SHELL_PACKAGE = "gentle-pi";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const deadlines = Object.freeze({ probe: 30 * SECOND, install: 20 * MINUTE, setup: 20 * MINUTE });

// Exact descriptors planPreflight can emit; anything else is a foreign request.
const knownActions = Object.freeze({
	"acquire-node": { kind: "acquire", target: "node", version: requirements.node },
	"verify-node": { kind: "verify", target: "node" },
	"acquire-pnpm": { kind: "acquire", target: "pnpm", version: requirements.pnpm },
	"verify-pnpm": { kind: "verify", target: "pnpm" },
	"setup-global-bin": { kind: "setup", target: "globalBin" },
	"acquire-go": { kind: "acquire", target: "go", version: requirements.go },
	"verify-go": { kind: "verify", target: "go" },
	"install-pi": { kind: "install-global", target: "pi", version: requirements.pi },
	"install-shell": { kind: "install-global", target: "shell", version: requirements.shell },
	"provision-native": { kind: "existing-installer", target: "gentleAi", version: requirements.gentleAi },
	"setup-shell": { kind: "normal-setup", target: "shell" },
	"verify-readiness": { kind: "verify", target: "stack" },
});
// T4 implements only the clean-stack path: both global packages are missing.
const requiredActions = ["install-pi", "install-shell", "setup-shell", "verify-readiness"];
const optionalActions = ["setup-global-bin"];

function stable(version) {
	const match = typeof version === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
	return match ? match.slice(1).map(Number) : null;
}
function atLeast(version, minimum) {
	const [left, right] = [stable(version), stable(minimum)];
	if (!left || !right) return false;
	for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] > right[i];
	return true;
}
if (!atLeast(PI_INSTALL_VERSION, requirements.pi)) throw new Error("Pi install pin is below the peer minimum");

function plainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function onlyKeys(value, allowed) {
	return plainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

/** Accept only `{ plan, consent }` where plan is an unmodified planPreflight result. */
function validRequest(request) {
	if (!onlyKeys(request, ["plan", "consent"]) || !onlyKeys(request.plan, ["tools", "blockers", "actions", "ready"])) return false;
	const { tools, blockers, actions, ready } = request.plan;
	if (!plainObject(tools) || !Array.isArray(blockers) || !Array.isArray(actions) || typeof ready !== "boolean") return false;
	const ids = new Set();
	for (const action of actions) {
		const expected = knownActions[action?.id];
		if (!expected || ids.has(action.id) || !onlyKeys(action, ["id", "kind", "target", "version"])) return false;
		if (Object.keys(action).length !== Object.keys(expected).length + 1) return false;
		if (Object.entries(expected).some(([key, value]) => action[key] !== value)) return false;
		ids.add(action.id);
	}
	return true;
}

/** Gates that need no process: returns a blocked reason or null. */
function planGate(plan, platform) {
	if (plan.blockers.length > 0) return "preflight-blocked";
	const ids = plan.actions.map((action) => action.id);
	// gentle-pi's postinstall may build Gentle AI from source on Windows; T4 never acquires Go.
	if (platform === "win32" && (ids.includes("acquire-go") || plan.tools.go?.status !== "reusable")) return "go-required";
	const supported = requiredActions.every((id) => ids.includes(id)) &&
		ids.every((id) => requiredActions.includes(id) || optionalActions.includes(id));
	return supported ? null : "unsupported-plan";
}

function pathKeyOf(env, platform) {
	return platform === "win32" ? Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "Path" : "PATH";
}
function envValue(env, name, platform) {
	const key = platform === "win32" ? Object.keys(env).find((candidate) => candidate.toUpperCase() === name) : name;
	return key === undefined ? undefined : env[key];
}

/** Child env: the user's env plus PNPM_HOME and `$PNPM_HOME/bin` first on PATH. */
function childEnvironment(env, platform, globalBin) {
	const path = platform === "win32" ? win32 : posix;
	const key = pathKeyOf(env, platform);
	const rest = String(env[key] ?? "").split(path.delimiter).filter((entry) => entry.length > 0);
	return { ...env, PNPM_HOME: globalBin.pnpmHome, [key]: [globalBin.path, ...rest].join(path.delimiter) };
}

/** pnpm comes from the bootstrap handoff, or a PATH executable on POSIX only. */
async function pnpmInvocation(env, platform, fs) {
	const path = platform === "win32" ? win32 : posix;
	const node = env.GENTLE_INSTALL_PNPM_NODE;
	const entry = env.GENTLE_INSTALL_PNPM_ENTRY;
	if (node && entry) {
		return path.isAbsolute(node) && path.isAbsolute(entry) ? { command: node, prefix: [entry] } : null;
	}
	// A Windows .cmd shim cannot be spawned with shell:false; require the direct handoff.
	if (platform === "win32") return null;
	for (const directory of String(env.PATH ?? "").split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue;
		const candidate = path.join(directory, "pnpm");
		if (await fs.isFile(candidate)) return { command: candidate, prefix: [] };
	}
	return null;
}

/** First `npm` the way Go's exec.LookPath (used by Gentle AI) finds it: each
 * absolute PATH directory in order and, on Windows, every PATHEXT extension in
 * PATHEXT order (lowercased, dot-prefixed, default .com/.exe/.bat/.cmd).
 */
async function firstNpm(child, platform, fs) {
	const path = platform === "win32" ? win32 : posix;
	const extensions = platform === "win32"
		? String(envValue(child, "PATHEXT", platform) || ".com;.exe;.bat;.cmd").toLowerCase().split(";")
			.filter((extension) => extension.length > 0).map((extension) => extension.startsWith(".") ? extension : `.${extension}`)
		: [""];
	for (const directory of String(child[pathKeyOf(child, platform)] ?? "").split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue;
		for (const extension of extensions) {
			const candidate = path.join(directory, `npm${extension}`);
			if (await fs.isFile(candidate)) return candidate;
		}
	}
	return null;
}

/** Genuine npm: the first resolved npm is the npm package's own CLI, which then runs.
 * Returns true, "npm-shadowed" (Windows: an earlier non-.cmd npm wins) or false.
 */
async function genuineNpm(child, platform, nodePath, adapters) {
	const path = platform === "win32" ? win32 : posix;
	const first = await firstNpm(child, platform, adapters.fs);
	if (!first) return false;
	let cli;
	if (platform === "win32") {
		if (path.extname(first).toLowerCase() !== ".cmd") return "npm-shadowed";
		cli = path.join(path.dirname(first), "node_modules", "npm", "bin", "npm-cli.js");
	} else {
		cli = await adapters.fs.realpath(first);
	}
	if (!(await adapters.fs.isFile(cli))) return false;
	const packageDir = path.dirname(path.dirname(cli));
	if (path.basename(cli) !== "npm-cli.js" || path.basename(packageDir) !== "npm" ||
		path.basename(path.dirname(packageDir)) !== "node_modules") return false;
	const metadata = JSON.parse(await adapters.fs.readText(path.join(packageDir, "package.json")));
	if (metadata?.name !== "npm" || !stable(metadata.version)) return false;
	const result = await adapters.run(nodePath, [cli, "--version"], { env: child, deadlineMs: deadlines.probe });
	return succeeded(result) && String(result.stdout ?? "").trim() === metadata.version;
}

function succeeded(result) {
	return result?.code === 0 && !result.signal && result.timedOut !== true;
}

function samePath(left, right, platform) {
	const path = platform === "win32" ? win32 : posix;
	const normal = (value) => path.normalize(value).replace(/(.)[\\/]+$/, "$1");
	const [a, b] = [normal(left), normal(right)];
	return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Pre-install `list -g --json`: true when neither package is listed in any
 * project, "existing-stack" when one is, false when the shape is unknown.
 */
function noExistingStack(stdout) {
	const projects = JSON.parse(stdout);
	if (!Array.isArray(projects)) return false;
	for (const project of projects) {
		if (!plainObject(project)) return false;
		for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
			const dependencies = project[field];
			if (dependencies === undefined) continue;
			if (!plainObject(dependencies)) return false;
			if (Object.hasOwn(dependencies, PI_PACKAGE) || Object.hasOwn(dependencies, SHELL_PACKAGE)) return "existing-stack";
		}
	}
	return true;
}

/** Installed gentle-pi root from `list -g --json`, confined under PNPM_HOME. */
async function verifiedPackageRoot(stdout, pnpmHome, platform, fs) {
	const path = platform === "win32" ? win32 : posix;
	const projects = JSON.parse(stdout);
	const dependencies = Array.isArray(projects) && projects.length === 1 ? projects[0]?.dependencies : null;
	if (!plainObject(dependencies)) return null;
	const pi = dependencies[PI_PACKAGE];
	const shell = dependencies[SHELL_PACKAGE];
	if (pi?.version !== PI_INSTALL_VERSION || shell?.version !== requirements.shell) return null;
	if (typeof shell.path !== "string" || !path.isAbsolute(shell.path)) return null;
	const [root, home] = [await fs.realpath(shell.path), await fs.realpath(pnpmHome)];
	const inside = path.relative(home, root);
	if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return null;
	return root;
}

/** Default integrity adapter: the package-local resolver, never a dev override.
 * `resolve` is injectable only so trusted tests can stand in for a pinned binary.
 */
export async function packageNativeGentleAi({ packageRoot, platform, env, home }, resolve = resolveGentleAiBinary) {
	const environment = { env, home };
	if (gentleAiDevBinaryOverrideConfigured(environment)) return { ok: false, reason: "development-override" };
	try {
		const binary = resolve(packageRoot, platform, readFileSync, environment);
		if (binary === gentleAiBinaryPath(packageRoot, platform)) return { ok: true };
	} catch {
		// Resolver errors name local paths; report only the classification.
	}
	return { ok: false, reason: "package-native-unverified" };
}

/**
 * runStandardInstall({ plan, consent }, adapters) -> { outcome, ... }
 * Outcomes: blocked (nothing installed), failed (stopped after `completed`),
 * terminal-action-required (installed; user PATH persisted, open a new
 * terminal) or ready. Adapters: platform, nodePath, env (user env), home?,
 * run(command, argv, { env, deadlineMs }) with shell:false semantics returning
 * { code, signal, timedOut, stdout }, fs { isFile, realpath, readText },
 * verifyGentleAi({ packageRoot, platform, env, home }) and log({ step, status }).
 * Nothing is ever deleted; no provisioning marker is written.
 */
export async function runStandardInstall(request, adapters) {
	const { platform, env, log = () => {} } = adapters;
	const completed = [];
	const blocked = (reason) => {
		log({ step: "gate", status: "blocked", reason });
		return { outcome: "blocked", reason, completed };
	};
	if (!validRequest(request)) return blocked("invalid-request");
	if (request.consent !== true) return blocked("consent-required");
	const gate = planGate(request.plan, platform);
	if (gate) return blocked(gate);

	const path = platform === "win32" ? win32 : posix;
	const globalBin = pnpmGlobalBin({ platform, env });
	if (!globalBin) return blocked("pnpm-home-unknown");
	if (!path.isAbsolute(adapters.nodePath ?? "")) return blocked("node-unavailable");
	const child = childEnvironment(env, platform, globalBin);
	const pnpm = await pnpmInvocation(env, platform, adapters.fs).catch(() => null);
	if (!pnpm) return blocked("pnpm-unavailable");
	const runPnpm = (args, deadlineMs) => adapters.run(pnpm.command, [...pnpm.prefix, ...args], { env: child, deadlineMs });
	const home = adapters.home ?? (platform === "win32" ? env.USERPROFILE : env.HOME);

	const list = () => runPnpm(["list", "-g", "--depth", "0", "--json"], deadlines.probe);

	// Pre-install gates: a false check or adapter exception blocks before mutation;
	// a check may return a more specific blocked reason instead of false.
	const checks = [
		["check-npm", "npm-unavailable", () => genuineNpm(child, platform, adapters.nodePath, adapters)],
		["check-global-bin", "global-bin-mismatch", async () => {
			const result = await runPnpm(["bin", "-g"], deadlines.probe);
			const reported = String(result.stdout ?? "").trim();
			return succeeded(result) && path.isAbsolute(reported) && samePath(reported, globalBin.path, platform);
		}],
		// Never rely on the caller's plan alone: an existing Pi or gentle-pi is not overwritten.
		["check-existing-stack", "global-list-unavailable", async () => {
			const result = await list();
			return succeeded(result) && noExistingStack(String(result.stdout ?? ""));
		}],
	];
	for (const [step, reason, check] of checks) {
		const verdict = await check().catch(() => false);
		if (verdict !== true) return blocked(typeof verdict === "string" ? verdict : reason);
		completed.push(step);
		log({ step, status: "done" });
	}

	// Mutating and post-install steps: a false result or exception is a failure.
	let packageRoot = null;
	const steps = [
		["install-global", async () => succeeded(await runPnpm(["add", "-g", `${PI_PACKAGE}@${PI_INSTALL_VERSION}`,
			`${SHELL_PACKAGE}@${requirements.shell}`, `--allow-build=${SHELL_PACKAGE}`], deadlines.install))],
		["verify-global-list", async () => {
			const result = await list();
			if (!succeeded(result)) return false;
			packageRoot = await verifiedPackageRoot(String(result.stdout ?? ""), globalBin.pnpmHome, platform, adapters.fs);
			return packageRoot !== null;
		}],
		["verify-shell-bin", () => adapters.fs.isFile(path.join(globalBin.path, platform === "win32" ? "gentle-shell.cmd" : "gentle-shell"))],
		["verify-gentle-ai", async () => (await adapters.verifyGentleAi({ packageRoot, platform, env, home }))?.ok === true],
		["shell-setup", async () => succeeded(await adapters.run(adapters.nodePath,
			[path.join(packageRoot, "bin", "gentle-shell.mjs"), "setup"], { env: child, deadlineMs: deadlines.setup }))],
	];
	// A child PATH never proves a fresh terminal; persist it with pnpm's own setup.
	// globalBin.onPath was computed from the user's own PATH, not the child env.
	const persistPath = !globalBin.onPath;
	if (persistPath) steps.push(["persist-path", async () => succeeded(await runPnpm(["setup"], deadlines.probe))]);
	for (const [step, run] of steps) {
		if (!(await Promise.resolve().then(run).catch(() => false))) {
			log({ step, status: "failed" });
			return { outcome: "failed", failedStep: step, completed };
		}
		completed.push(step);
		log({ step, status: "done" });
	}
	if (persistPath) return { outcome: "terminal-action-required", action: "open-new-terminal", completed };
	return { outcome: "ready", completed };
}
