import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gentleAiBinaryPath } from "../runtime/gentle-ai-binary.mjs";
import { planPreflight, requirements } from "../scripts/installer-preflight.mjs";
import { PI_INSTALL_VERSION, packageNativeGentleAi, runStandardInstall } from "../scripts/installer-runner.mjs";

const HOME = "/home/u";
const PNPM_HOME = "/home/u/.local/share/pnpm";
const BIN = `${PNPM_HOME}/bin`;
const NODE = "/opt/node/bin/node";
const ENTRY = "/tools/pnpm/bin/pnpm.mjs";
const NPM_CLI = "/opt/node/lib/node_modules/npm/bin/npm-cli.js";
const PACKAGE_ROOT = `${PNPM_HOME}/global/v11/node_modules/gentle-pi`;
const SHELL_ENTRY = `${PACKAGE_ROOT}/bin/gentle-shell.mjs`;

const W_NODE_DIR = "C:\\Program Files\\nodejs";
const W_NODE = `${W_NODE_DIR}\\node.exe`;
const W_ENTRY = "C:\\Tools\\pnpm\\bin\\pnpm.mjs";
const W_NPM_CMD = `${W_NODE_DIR}\\npm.cmd`;
const W_NPM_CLI = `${W_NODE_DIR}\\node_modules\\npm\\bin\\npm-cli.js`;
const W_PNPM_HOME = "C:\\Users\\u\\AppData\\Local\\pnpm";
const W_BIN = `${W_PNPM_HOME}\\bin`;
const W_ROOT = `${W_PNPM_HOME}\\global\\v11\\node_modules\\gentle-pi`;

type Call = { command: string; args: string[]; env: Record<string, string>; deadlineMs: number };
type Result = { code: number | null; signal?: string | null; timedOut?: boolean; stdout?: string };
type Layout = { platform: string; node: string; entry: string; npmCli: string; shellEntry: string; bin: string;
	root: string; env: Record<string, string>; files: string[]; realpaths: Record<string, string>; texts: Record<string, string> };

const npmPackage = JSON.stringify({ name: "npm", version: "11.19.0" });
const posixLayout: Layout = {
	platform: "linux", node: NODE, entry: ENTRY, npmCli: NPM_CLI, shellEntry: SHELL_ENTRY, bin: BIN, root: PACKAGE_ROOT,
	env: { HOME, PATH: `${BIN}:/opt/node/bin:/usr/bin`, GENTLE_INSTALL_PNPM_NODE: NODE, GENTLE_INSTALL_PNPM_ENTRY: ENTRY },
	files: ["/opt/node/bin/npm", NPM_CLI, `${BIN}/gentle-shell`],
	realpaths: { "/opt/node/bin/npm": NPM_CLI, [PNPM_HOME]: PNPM_HOME, [PACKAGE_ROOT]: PACKAGE_ROOT },
	texts: { "/opt/node/lib/node_modules/npm/package.json": npmPackage },
};
// The user's Path already holds the global bin, spelled with different case.
const windowsLayout: Layout = {
	platform: "win32", node: W_NODE, entry: W_ENTRY, npmCli: W_NPM_CLI, shellEntry: `${W_ROOT}\\bin\\gentle-shell.mjs`,
	bin: W_BIN, root: W_ROOT,
	env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local", USERPROFILE: "C:\\Users\\u",
		Path: `c:\\users\\u\\appdata\\local\\PNPM\\bin\\;${W_NODE_DIR};C:\\Windows`,
		GENTLE_INSTALL_PNPM_NODE: W_NODE, GENTLE_INSTALL_PNPM_ENTRY: W_ENTRY },
	files: [W_NPM_CMD, W_NPM_CLI, `${W_BIN}\\gentle-shell.cmd`],
	realpaths: { [W_PNPM_HOME]: W_PNPM_HOME, [W_ROOT]: W_ROOT },
	texts: { [`${W_NODE_DIR}\\node_modules\\npm\\package.json`]: npmPackage },
};

const absent = { available: false };
const tool = (version: string) => ({ available: true, version, usable: true });
function plan(platform = "linux", change: object = {}) {
	return planPreflight({ platform, arch: "x64", node: tool("24.18.0"), pnpm: { ...tool("11.1.1"), compatible: true },
		pi: absent, shell: absent, gentleAi: absent, go: platform === "win32" ? tool("1.26.0") : absent,
		globalBin: { available: true, path: BIN, writable: true, onPath: true }, setup: false, ...change });
}
function listing(pi = PI_INSTALL_VERSION, shell = requirements.shell, path = PACKAGE_ROOT) {
	return JSON.stringify([{ path: `${PNPM_HOME}/global/v11`, dependencies: {
		"@earendil-works/pi-coding-agent": { version: pi },
		"gentle-pi": { version: shell, path },
	} }]);
}

// The same response key may hold a sequence: the first list -g precedes installation.
const LIST = "list -g --depth 0 --json";
const emptyList = { code: 0, stdout: "[]" };

function harness({ env = {}, results = {}, files = [] as string[], integrity = { ok: true } as object, layout = posixLayout } = {}) {
	const calls: Call[] = [];
	const logs: object[] = [];
	const fileSet = new Set([...layout.files, ...files]);
	const { realpaths, texts } = layout;
	const defaults: Record<string, Result | Result[]> = {
		"--version": { code: 0, stdout: "11.19.0\n" },
		"bin -g": { code: 0, stdout: `${layout.bin}\n` },
		add: { code: 0 },
		[LIST]: [emptyList, { code: 0, stdout: listing(PI_INSTALL_VERSION, requirements.shell, layout.root) }],
		"gentle-shell setup": { code: 0 },
		"pnpm setup": { code: 0 },
	};
	const responses = { ...defaults, ...results } as Record<string, Result | Result[]>;
	const seen: Record<string, number> = {};
	function key(command: string, args: string[]) {
		if (command === layout.node && args[0] === layout.npmCli) return args.slice(1).join(" ");
		if (command === layout.node && args[0] === layout.shellEntry) return `gentle-shell ${args.slice(1).join(" ")}`;
		const rest = command === layout.node && args[0] === layout.entry ? args.slice(1) : args;
		if (rest[0] === "add") return "add";
		if (rest.join(" ") === "setup") return "pnpm setup";
		return rest.join(" ");
	}
	const integrityCalls: object[] = [];
	const adapters = {
		platform: layout.platform,
		nodePath: layout.node,
		env: { ...layout.env, ...env } as Record<string, string>,
		run: async (command: string, args: string[], options: { env: Record<string, string>; deadlineMs: number }) => {
			calls.push({ command, args, env: options.env, deadlineMs: options.deadlineMs });
			const k = key(command, args);
			const entry = responses[k];
			assert.ok(entry, `unexpected command ${command} ${args.join(" ")}`);
			const index = seen[k] ?? 0;
			seen[k] = index + 1;
			const response = Array.isArray(entry) ? entry[Math.min(index, entry.length - 1)] : entry;
			return { signal: null, timedOut: false, stdout: "", stderr: "", ...response };
		},
		fs: {
			isFile: async (path: string) => fileSet.has(path),
			realpath: async (path: string) => {
				if (!(path in realpaths)) throw new Error(`ENOENT ${path}`);
				return realpaths[path];
			},
			readText: async (path: string) => {
				if (!(path in texts)) throw new Error(`ENOENT ${path}`);
				return texts[path];
			},
		},
		verifyGentleAi: async (request: object) => {
			integrityCalls.push(request);
			return integrity;
		},
		log: (entry: object) => logs.push(entry),
	};
	const pnpmCalls = () => calls.filter((call) => call.args[0] === layout.entry).map((call) => call.args.slice(1).join(" "));
	return { adapters, calls, logs, pnpmCalls, integrityCalls };
}

const INSTALL = `add -g @earendil-works/pi-coding-agent@${PI_INSTALL_VERSION} gentle-pi@${requirements.shell} --allow-build=gentle-pi`;

test("declined or missing consent runs no commands", async () => {
	for (const consent of [false, undefined, "yes", 1]) {
		const h = harness();
		const result = await runStandardInstall({ plan: plan(), consent }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, "consent-required");
		assert.deepEqual(h.calls, []);
	}
});

test("caller-supplied commands, URLs, roots or env are rejected before any command", async () => {
	const base = plan();
	const injected = [
		{ plan: base, consent: true, commands: [["rm", "-rf", "/"]] },
		{ plan: base, consent: true, env: { PATH: "/evil" } },
		{ plan: { ...base, commands: ["curl https://example.invalid"] }, consent: true },
		{ plan: { ...base, actions: [...base.actions, { id: "run", kind: "exec", target: "sh", command: "sh" }] }, consent: true },
		{ plan: { ...base, actions: base.actions.map((a: object) => ({ ...a, url: "https://example.invalid" })) }, consent: true },
		{ plan: { ...base, actions: base.actions.map((a: { id: string }) => a.id === "install-shell" ? { ...a, version: "9.9.9" } : a) }, consent: true },
		{ plan: { ...base, root: "/elsewhere" }, consent: true },
		null,
	];
	for (const request of injected) {
		const h = harness();
		const result = await runStandardInstall(request, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, "invalid-request");
		assert.deepEqual(h.calls, []);
	}
});

test("preflight blockers and unsupported T4 plans are blocked before any command", async () => {
	const cases = [
		plan("linux", { node: tool("20.0.0") }),
		plan("linux", { node: absent }),
		plan("linux", { pi: tool("1.2.0") }),
		plan("linux", { pi: tool("1.2.0"), shell: { ...tool("4.0.0"), global: true } }),
	];
	for (const fixed of cases) {
		const h = harness();
		const result = await runStandardInstall({ plan: fixed, consent: true }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.match(result.reason, /^(preflight-blocked|unsupported-plan)$/);
		assert.deepEqual(h.calls, []);
	}
});

test("Windows without suitable Go is blocked before install", async () => {
	// Missing Go yields an acquire-go intent; too-old Go is already a preflight blocker.
	for (const [go, reason] of [[absent, "go-required"], [tool("1.25.9"), "preflight-blocked"]] as const) {
		const h = harness({ layout: windowsLayout });
		const result = await runStandardInstall({ plan: plan("win32", { go }), consent: true }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, reason);
		assert.deepEqual(h.calls, []);
	}
});

test("Windows uses the case-insensitive Path key for the child env and bin -g comparison", async () => {
	const h = harness({ layout: windowsLayout, results: { "bin -g": { code: 0, stdout: "c:\\users\\u\\appdata\\local\\PNPM\\BIN\\\r\n" } } });
	const result = await runStandardInstall({ plan: plan("win32"), consent: true }, h.adapters);
	assert.equal(result.outcome, "ready");
	assert.ok(h.calls.length > 0);
	for (const call of h.calls) {
		assert.equal(call.env.PATH, undefined);
		assert.equal(call.env.PNPM_HOME, W_PNPM_HOME);
		assert.equal(call.env.Path.split(";")[0], W_BIN);
	}
	assert.deepEqual(h.calls.at(-1)?.args, [`${W_ROOT}\\bin\\gentle-shell.mjs`, "setup"]);
	const missing = harness({ layout: windowsLayout, env: { Path: `${W_NODE_DIR};C:\\Windows` } });
	const persisted = await runStandardInstall({ plan: plan("win32"), consent: true }, missing.adapters);
	assert.equal(persisted.outcome, "terminal-action-required");
	assert.equal(missing.pnpmCalls().at(-1), "setup");
});

test("Windows npm resolves like Go exec.LookPath: PATH order, then PATHEXT order", async () => {
	const shadows = [
		{ files: [`${W_NODE_DIR}\\npm.exe`] },
		{ files: [`${W_NODE_DIR}\\npm.bat`] },
		{ files: [`${W_NODE_DIR}\\npm.com`] },
		{ files: ["C:\\Early\\npm.exe"], env: { Path: `C:\\Early;${W_NODE_DIR}` } },
		{ files: [`${W_NODE_DIR}\\npm.ps1`, `${W_NODE_DIR}\\npm.exe`], env: { PathExt: ".PS1;.CMD" } },
	];
	for (const { files, env } of shadows) {
		const h = harness({ layout: windowsLayout, files, env });
		const result = await runStandardInstall({ plan: plan("win32"), consent: true }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, "npm-shadowed");
		assert.equal(h.pnpmCalls().some((call) => call.startsWith("add")), false);
	}
	const fake = harness({ layout: windowsLayout, files: ["C:\\Early\\npm.cmd"], env: { Path: `C:\\Early;${W_NODE_DIR}` } });
	assert.equal((await runStandardInstall({ plan: plan("win32"), consent: true }, fake.adapters)).reason, "npm-unavailable");
	// PATHEXT order wins inside one directory: .CMD before .EXE resolves the genuine npm.cmd.
	const ordered = harness({ layout: windowsLayout, files: [`${W_NODE_DIR}\\npm.exe`], env: { PATHEXT: "cmd;.EXE" } });
	assert.equal((await runStandardInstall({ plan: plan("win32"), consent: true }, ordered.adapters)).outcome, "ready");
	const noCmd = harness({ layout: windowsLayout, env: { PATHEXT: ".EXE;.COM" } });
	assert.equal((await runStandardInstall({ plan: plan("win32"), consent: true }, noCmd.adapters)).reason, "npm-unavailable");
});

test("Windows without the direct pnpm handoff is blocked rather than spawning a .cmd shim", async () => {
	const h = harness({ env: { GENTLE_INSTALL_PNPM_NODE: "", GENTLE_INSTALL_PNPM_ENTRY: "" } });
	h.adapters.platform = "win32";
	h.adapters.env = { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local", Path: "C:\\Windows" };
	const result = await runStandardInstall({ plan: plan("win32"), consent: true }, h.adapters);
	assert.equal(result.outcome, "blocked");
	assert.equal(result.reason, "pnpm-unavailable");
	assert.deepEqual(h.calls, []);
});

test("missing or impersonated npm blocks before installation", async () => {
	const variants = [
		(h: ReturnType<typeof harness>) => { h.adapters.env.PATH = `${BIN}:/usr/bin`; },
		(h: ReturnType<typeof harness>) => { h.adapters.fs.realpath = async () => "/opt/fake/npm-wrapper.sh"; },
		(h: ReturnType<typeof harness>) => { h.adapters.fs.readText = async () => JSON.stringify({ name: "not-npm", version: "1.0.0" }); },
	];
	for (const vary of variants) {
		const h = harness();
		vary(h);
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, "npm-unavailable");
		assert.equal(h.pnpmCalls().some((call) => call.startsWith("add")), false);
	}
	const lying = harness({ results: { "--version": { code: 0, stdout: "10.0.0\n" } } });
	assert.equal((await runStandardInstall({ plan: plan(), consent: true }, lying.adapters)).reason, "npm-unavailable");
	assert.equal(lying.pnpmCalls().some((call) => call.startsWith("add")), false);
});

test("verified clean install runs one exact add -g with a package-scoped build approval", async () => {
	const h = harness();
	const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
	assert.equal(result.outcome, "ready");
	assert.deepEqual(h.pnpmCalls(), ["bin -g", LIST, INSTALL, LIST]);
	const adds = h.calls.filter((call) => call.args[1] === "add");
	assert.equal(adds.length, 1);
	assert.equal(adds[0].args.some((arg) => /dangerously|allow-build=\*|--allow-build$|approve-builds/.test(arg)), false);
	assert.equal(adds[0].command, NODE);
	assert.deepEqual(h.calls.at(-1)?.args, [SHELL_ENTRY, "setup"]);
	assert.deepEqual(result.completed, ["check-npm", "check-global-bin", "check-existing-stack", "install-global",
		"verify-global-list", "verify-shell-bin", "verify-gentle-ai", "shell-setup"]);
	assert.deepEqual(h.integrityCalls, [{ packageRoot: PACKAGE_ROOT, platform: "linux", env: h.adapters.env, home: HOME }]);
	assert.equal(JSON.stringify(h.logs).includes("11.19.0"), false);
});

test("every child env has PNPM_HOME and $PNPM_HOME/bin first on PATH", async () => {
	const h = harness({ env: { PATH: "/opt/node/bin:/usr/bin" } });
	await runStandardInstall({ plan: plan("linux", { globalBin: { available: true, path: BIN, writable: true, onPath: false } }), consent: true }, h.adapters);
	assert.ok(h.calls.length > 0);
	for (const call of h.calls) {
		assert.equal(call.env.PNPM_HOME, PNPM_HOME);
		assert.equal(call.env.PATH.split(":")[0], BIN);
		assert.ok(call.deadlineMs > 0);
	}
	assert.equal(h.adapters.env.PNPM_HOME, undefined);
});

test("bin -g mismatch or failure is blocked before installation", async () => {
	for (const result of [{ code: 0, stdout: `${PNPM_HOME}\n` }, { code: 1, stdout: "" }, { code: 0, stdout: "/elsewhere/bin\n" }]) {
		const h = harness({ results: { "bin -g": result } });
		const outcome = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(outcome.outcome, "blocked");
		assert.equal(outcome.reason, "global-bin-mismatch");
		assert.equal(h.pnpmCalls().some((call) => call.startsWith("add")), false);
	}
});

test("install nonzero, signal or deadline fails and reports completed steps", async () => {
	for (const add of [{ code: 1 }, { code: null, signal: "SIGKILL" }, { code: 0, timedOut: true }]) {
		const h = harness({ results: { add } });
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "failed");
		assert.equal(result.failedStep, "install-global");
		assert.deepEqual(result.completed, ["check-npm", "check-global-bin", "check-existing-stack"]);
		assert.equal(h.pnpmCalls().length, 3);
	}
});

test("an existing global Pi or gentle-pi blocks before installation regardless of the plan", async () => {
	const existing = [
		listing(),
		JSON.stringify([{ dependencies: { "@earendil-works/pi-coding-agent": { version: "1.2.0" } } }]),
		JSON.stringify([{ dependencies: {} }, { dependencies: { "gentle-pi": { version: "3.0.0" } } }]),
		JSON.stringify([{ optionalDependencies: { "gentle-pi": { version: "4.0.0" } } }]),
	];
	for (const stdout of existing) {
		const h = harness({ results: { [LIST]: { code: 0, stdout } } });
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, "existing-stack");
		assert.equal(h.pnpmCalls().some((call) => call.startsWith("add")), false);
	}
	const unrelated = harness({ results: { [LIST]: [{ code: 0, stdout: JSON.stringify([{ dependencies: { typescript: { version: "5.0.0" } } }]) },
		{ code: 0, stdout: listing() }] } });
	assert.equal((await runStandardInstall({ plan: plan(), consent: true }, unrelated.adapters)).outcome, "ready");
});

test("a failed or unparseable pre-install global list blocks before mutation", async () => {
	for (const list of [{ code: 1, stdout: "[]" }, { code: 0, timedOut: true, stdout: "[]" }, { code: 0, stdout: "not json" },
		{ code: 0, stdout: "" }, { code: 0, stdout: "{}" }, { code: 0, stdout: JSON.stringify([{ dependencies: [] }]) }]) {
		const h = harness({ results: { [LIST]: list } });
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "blocked");
		assert.equal(result.reason, "global-list-unavailable");
		assert.deepEqual(h.pnpmCalls(), ["bin -g", LIST]);
	}
});

test("global list missing a package, wrong version or unconfined path fails", async () => {
	const listings = [
		JSON.stringify([{ dependencies: { "gentle-pi": { version: requirements.shell, path: PACKAGE_ROOT } } }]),
		listing("0.99.1"),
		listing(PI_INSTALL_VERSION, "3.0.0"),
		listing(PI_INSTALL_VERSION, requirements.shell, "/elsewhere/gentle-pi"),
		"not json",
	];
	for (const stdout of listings) {
		const h = harness({ results: { [LIST]: [emptyList, { code: 0, stdout }] } });
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "failed");
		assert.equal(result.failedStep, "verify-global-list");
		assert.equal(h.calls.some((call) => call.args[0] === SHELL_ENTRY), false);
	}
});

test("missing gentle-shell bin in $PNPM_HOME/bin fails", async () => {
	const h = harness();
	h.adapters.fs.isFile = async (path: string) => path !== `${BIN}/gentle-shell` && [NPM_CLI, "/opt/node/bin/npm"].includes(path);
	const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
	assert.equal(result.outcome, "failed");
	assert.equal(result.failedStep, "verify-shell-bin");
});

test("integrity failure or development override fails before setup", async () => {
	for (const integrity of [{ ok: false, reason: "package-local-binary-missing" }, { ok: false, reason: "development-override" }, {}]) {
		const h = harness({ integrity });
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "failed");
		assert.equal(result.failedStep, "verify-gentle-ai");
		assert.equal(h.calls.some((call) => call.args[0] === SHELL_ENTRY), false);
	}
});

test("gentle-shell setup nonzero, signal or deadline fails", async () => {
	for (const setup of [{ code: 2 }, { code: null, signal: "SIGTERM" }, { code: 0, timedOut: true }]) {
		const h = harness({ results: { "gentle-shell setup": setup } });
		const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
		assert.equal(result.outcome, "failed");
		assert.equal(result.failedStep, "shell-setup");
		assert.ok(result.completed.includes("verify-gentle-ai"));
	}
});

test("$PNPM_HOME/bin absent from the user PATH runs pnpm setup and requires a new terminal", async () => {
	const h = harness({ env: { PATH: `${PNPM_HOME}:/opt/node/bin:/usr/bin` } });
	const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
	assert.equal(result.outcome, "terminal-action-required");
	assert.equal(result.action, "open-new-terminal");
	assert.equal(h.pnpmCalls().at(-1), "setup");
	assert.equal(result.completed.at(-1), "persist-path");
	const failing = harness({ env: { PATH: "/opt/node/bin:/usr/bin" }, results: { "pnpm setup": { code: 1 } } });
	const failed = await runStandardInstall({ plan: plan(), consent: true }, failing.adapters);
	assert.equal(failed.outcome, "failed");
	assert.equal(failed.failedStep, "persist-path");
});

test("already on PATH and fully verified is ready without pnpm setup", async () => {
	const h = harness();
	const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
	assert.equal(result.outcome, "ready");
	assert.equal(h.pnpmCalls().includes("setup"), false);
});

test("an unexpected adapter exception fails closed without leaking its message", async () => {
	const h = harness();
	h.adapters.run = async () => { throw new Error("private /home/u/secret"); };
	const result = await runStandardInstall({ plan: plan(), consent: true }, h.adapters);
	assert.equal(result.outcome, "blocked");
	assert.equal(JSON.stringify(result).includes("secret"), false);
	assert.equal(JSON.stringify(h.logs).includes("secret"), false);
});

test("package-native integrity rejects development overrides and unverified package roots", async () => {
	const dir = mkdtempSync(join(tmpdir(), "gentle-runner-integrity-"));
	try {
		const dev = join(dir, "dev-gentle-ai");
		writeFileSync(dev, "#!/bin/sh\n");
		chmodSync(dev, 0o755);
		const overridden = await packageNativeGentleAi({ packageRoot: dir, platform: "linux", home: dir,
			env: { GENTLE_PI_GENTLE_AI_DEV_BINARY: dev } });
		assert.deepEqual(overridden, { ok: false, reason: "development-override" });
		const missing = await packageNativeGentleAi({ packageRoot: dir, platform: "linux", home: dir, env: {} });
		assert.deepEqual(missing, { ok: false, reason: "package-native-unverified" });
		const seen: unknown[][] = [];
		const verified = await packageNativeGentleAi({ packageRoot: dir, platform: "linux", home: dir, env: {} },
			(...args: unknown[]) => { seen.push(args); return gentleAiBinaryPath(dir, "linux"); });
		assert.deepEqual(verified, { ok: true });
		assert.equal(seen.length, 1);
		assert.deepEqual(seen[0].slice(0, 2), [dir, "linux"]);
		assert.deepEqual(seen[0][3], { env: {}, home: dir });
		const elsewhere = await packageNativeGentleAi({ packageRoot: dir, platform: "linux", home: dir, env: {} }, () => dev);
		assert.deepEqual(elsewhere, { ok: false, reason: "package-native-unverified" });
		let called = false;
		await packageNativeGentleAi({ packageRoot: dir, platform: "linux", home: dir, env: { GENTLE_PI_GENTLE_AI_DEV_BINARY: dev } },
			() => { called = true; return gentleAiBinaryPath(dir, "linux"); });
		assert.equal(called, false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
