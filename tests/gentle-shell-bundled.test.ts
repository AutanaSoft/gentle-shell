import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import {
	bundledChildEnv,
	bundledPi,
	bundledUpdateNotice,
	bundledUpdatePlan,
	parseBundledUpgradeArgs,
	resolveBundledInstall,
	type BundledFs,
	type BundledPi,
} from "../lib/gentle-shell-bundled.ts";

// A fake filesystem keyed by exact paths, so every platform's paths are plain
// strings on every runner: realpath maps a link to its target, and any other
// path holding a file to itself; readText returns a regular file's text,
// readLink a symlink's.
function fakeFs({ real = {}, files = {}, links = {} }: { real?: Record<string, string>; files?: Record<string, string>; links?: Record<string, string> }): BundledFs {
	const known = [...Object.keys(files), ...Object.keys(links), ...Object.values(real)];
	const exists = (path: string) => known.some((entry) => entry === path || entry.startsWith(`${path}/`) || entry.startsWith(`${path}\\`));
	return {
		realpath: (path) => real[path] ?? (exists(path) ? path : undefined),
		readText: (path) => files[path],
		readLink: (path) => links[path],
	};
}

const ID = "4.1.0-1.1.0";
const POSIX_ROOT = "/home/ana/.gentle-shell";
const POSIX_VERSION = posix.join(POSIX_ROOT, "versions", ID);
const POSIX_PACKAGE = posix.join(POSIX_VERSION, "node_modules", ".pnpm", "gentle-pi@4.1.0", "node_modules", "gentle-pi");
const PI_PACKAGE = (version: string, path = posix) => path.join(version, "node_modules", "@earendil-works", "pi-coding-agent");

function posixInstall(overrides: { current?: string; marker?: string; link?: string } = {}) {
	return fakeFs({
		real: { [posix.join(POSIX_VERSION, "node_modules", "gentle-pi")]: overrides.link ?? POSIX_PACKAGE },
		files: { [posix.join(POSIX_VERSION, ".gentle-shell-version")]: overrides.marker ?? `${ID}\n`, [posix.join(POSIX_PACKAGE, "package.json")]: "{}" },
		links: { [posix.join(POSIX_ROOT, "current")]: overrides.current ?? `versions/${ID}` },
	});
}

test("resolveBundledInstall finds the version folder current names from the real package root", () => {
	assert.deepEqual(resolveBundledInstall({ packageRoot: POSIX_PACKAGE, platform: "linux", fs: posixInstall() }),
		{ root: POSIX_ROOT, id: ID, versionDir: POSIX_VERSION });
});

test("resolveBundledInstall is off unless current names this marked version and its gentle-pi is this package", () => {
	// Kept for rollback, but not the active one.
	assert.equal(resolveBundledInstall({ packageRoot: POSIX_PACKAGE, platform: "linux", fs: posixInstall({ current: "versions/4.0.0-1.0.0" }) }), undefined);
	// An unfinished install, or a folder without our marker.
	assert.equal(resolveBundledInstall({ packageRoot: POSIX_PACKAGE, platform: "linux", fs: posixInstall({ marker: `installing ${ID} 42\n` }) }), undefined);
	// The version's gentle-pi is another copy, not the running one.
	assert.equal(resolveBundledInstall({ packageRoot: POSIX_PACKAGE, platform: "linux", fs: posixInstall({ link: "/elsewhere/gentle-pi" }) }), undefined);
	// A global npm or pnpm install, or a source checkout.
	for (const packageRoot of ["/usr/lib/node_modules/gentle-pi", "/home/ana/.local/share/pnpm/global/5/node_modules/gentle-pi", "/home/ana/src/gentle-shell"]) {
		assert.equal(resolveBundledInstall({ packageRoot, platform: "linux", fs: posixInstall() }), undefined, packageRoot);
	}
	// An id the bundled install never writes.
	const unsafe = posix.join(POSIX_ROOT, "versions", "-x", "node_modules", "gentle-pi");
	assert.equal(resolveBundledInstall({ packageRoot: unsafe, platform: "linux", fs: fakeFs({
		files: { [posix.join(POSIX_ROOT, "versions", "-x", ".gentle-shell-version")]: "-x\n" }, links: { [posix.join(POSIX_ROOT, "current")]: "versions/-x" } }) }), undefined);
});

test("resolveBundledInstall on Windows reads the current pointer file, never a link", () => {
	const root = "C:\\Users\\Ana\\AppData\\Local\\gentle-shell";
	const version = win32.join(root, "versions", ID);
	const packageRoot = win32.join(version, "node_modules", ".pnpm", "gentle-pi@4.1.0", "node_modules", "gentle-pi");
	const files = { [win32.join(version, ".gentle-shell-version")]: `${ID}\n`, [win32.join(root, "current")]: `${ID}\n` };
	const real = { [win32.join(version, "node_modules", "gentle-pi")]: packageRoot };
	assert.deepEqual(resolveBundledInstall({ packageRoot, platform: "win32", fs: fakeFs({ real, files }) }), { root, id: ID, versionDir: version });
	const linked = fakeFs({ real, files: { [win32.join(version, ".gentle-shell-version")]: `${ID}\n` }, links: { [win32.join(root, "current")]: `versions/${ID}` } });
	assert.equal(resolveBundledInstall({ packageRoot, platform: "win32", fs: linked }), undefined);
});

function piFiles(pinned: string, installed: string, path = posix, version = POSIX_VERSION) {
	const pi = PI_PACKAGE(version, path);
	return {
		[path.join(version, "package.json")]: JSON.stringify({ dependencies: { "gentle-pi": "4.1.0", "@earendil-works/pi-coding-agent": pinned } }),
		[path.join(pi, "package.json")]: JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: installed, bin: { pi: "dist/bundle/cli.js" } }),
		[path.join(pi, "dist", "bundle", "cli.js")]: "",
	};
}
const install = { root: POSIX_ROOT, id: ID, versionDir: POSIX_VERSION };
const messageOf = (pi: BundledPi) => ("message" in pi ? pi.message : "");

test("bundledPi returns only the Pi the version pins, inside the version folder", () => {
	assert.deepEqual(bundledPi(install, { platform: "linux", fs: fakeFs({ files: piFiles("1.1.0", "1.1.0") }) }),
		{ ok: true, version: "1.1.0", cli: posix.join(PI_PACKAGE(POSIX_VERSION), "dist", "bundle", "cli.js") });
	const windows = { root: "C:\\G", id: ID, versionDir: `C:\\G\\versions\\${ID}` };
	assert.deepEqual(bundledPi(windows, { platform: "win32", fs: fakeFs({ files: piFiles("1.1.0", "1.1.0", win32, windows.versionDir) }) }),
		{ ok: true, version: "1.1.0", cli: win32.join(PI_PACKAGE(windows.versionDir, win32), "dist", "bundle", "cli.js") });
});

test("bundledPi fails with the version, the pinned Pi and the way to repair it", () => {
	const repair = /Gentle Shell 4\.1\.0-1\.1\.0 .*Pi 1\.1\.0.*gentle-shell upgrade.*installer/s;
	const mismatch = bundledPi(install, { platform: "linux", fs: fakeFs({ files: piFiles("1.1.0", "1.0.0") }) });
	assert.equal(mismatch.ok, false);
	assert.match(messageOf(mismatch), repair);
	assert.match(messageOf(mismatch), /found Pi 1\.0\.0/);
	const files = piFiles("1.1.0", "1.1.0");
	delete files[posix.join(PI_PACKAGE(POSIX_VERSION), "dist", "bundle", "cli.js")];
	const missing = bundledPi(install, { platform: "linux", fs: fakeFs({ files }) });
	assert.match(messageOf(missing), repair);
	// A Pi linked from outside the version folder is not the bundled one.
	const outside = fakeFs({ real: { [PI_PACKAGE(POSIX_VERSION)]: "/usr/lib/node_modules/@earendil-works/pi-coding-agent" }, files: piFiles("1.1.0", "1.1.0") });
	assert.equal(bundledPi(install, { platform: "linux", fs: outside }).ok, false);
});

test("bundledChildEnv gives children the bundled Pi, no Pi override and no Pi update check", () => {
	const env = bundledChildEnv({ PATH: "/our/node:/v/.bin:/usr/bin", GENTLE_SHELL_PI: "/usr/local/bin/pi", GENTLE_PI_AGENTS_PI: "pi" }, { node: "/g/node", cli: "/g/cli.js" });
	assert.equal(env.GENTLE_SHELL_PI, undefined);
	assert.equal(env.GENTLE_PI_AGENTS_PI, "/g/node /g/cli.js");
	assert.equal(env.PI_SKIP_VERSION_CHECK, "1");
	assert.equal(env.PATH, "/our/node:/v/.bin:/usr/bin");
	// The subagent runner splits that variable on whitespace: a spaced path falls
	// back to its own default, the running node and cli.js.
	const spaced = bundledChildEnv({ GENTLE_PI_AGENTS_PI: "pi" }, { node: "C:\\Users\\Ana Li\\node.exe", cli: "C:\\cli.js" });
	assert.equal("GENTLE_PI_AGENTS_PI" in spaced, false);
});

test("bundledUpdatePlan redirects Pi's own update and keeps the extension updates", () => {
	assert.deepEqual(bundledUpdatePlan(["update"]), { self: true });
	assert.deepEqual(bundledUpdatePlan(["update", "--self"]), { self: true });
	assert.deepEqual(bundledUpdatePlan(["update", "pi"]), { self: true });
	assert.deepEqual(bundledUpdatePlan(["update", "self"]), { self: true });
	assert.deepEqual(bundledUpdatePlan(["update", "--all"]), { self: true, piArgs: ["update", "--extensions"] });
	assert.deepEqual(bundledUpdatePlan(["update", "--self", "--extensions", "--approve"]), { self: true, piArgs: ["update", "--extensions", "--approve"] });
	for (const passthrough of [["update", "--extensions"], ["update", "npm:x"], ["update", "--models"], ["update", "--extension", "npm:x"], ["update", "--help"]]) {
		assert.deepEqual(bundledUpdatePlan(passthrough), { self: false, piArgs: passthrough }, passthrough.join(" "));
	}
});

test("bundledUpdateNotice explains the pinned Pi and runs or names gentle-shell upgrade", () => {
	const interactive = bundledUpdateNotice({ piVersion: "1.1.0", interactive: true }).join("\n");
	assert.match(interactive, /Pi ships pinned with Gentle Shell \(Pi 1\.1\.0\)/);
	assert.match(interactive, /Running 'gentle-shell upgrade'/);
	assert.match(bundledUpdateNotice({ piVersion: "1.1.0", interactive: false }).join("\n"), /Run 'gentle-shell upgrade'/);
});

test("parseBundledUpgradeArgs accepts the release channel and --rollback and refuses the main channel", () => {
	assert.deepEqual(parseBundledUpgradeArgs([]), { action: "upgrade" });
	assert.deepEqual(parseBundledUpgradeArgs(["--channel", "release"]), { action: "upgrade" });
	assert.deepEqual(parseBundledUpgradeArgs(["--channel=release"]), { action: "upgrade" });
	assert.deepEqual(parseBundledUpgradeArgs(["--rollback"]), { action: "rollback" });
	for (const args of [["--channel", "main"], ["--channel=main"]]) {
		const parsed = parseBundledUpgradeArgs(args);
		assert.equal("error" in parsed && parsed.usage, false);
		assert.match("error" in parsed ? parsed.error : "", /release channel only/);
	}
	for (const args of [["--rollback", "--channel", "release"], ["--channel"], ["--nope"]]) {
		const parsed = parseBundledUpgradeArgs(args);
		assert.equal("error" in parsed && parsed.usage, true, args.join(" "));
	}
});

// The real bin, run from a bundled prefix: a copy of bin/ and package.json
// placed where pnpm puts gentle-pi (runtime/ and scripts/ linked from this
// checkout), a fake exact Pi beside it, and `current` naming the version.
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const posixHost = process.platform === "win32" ? "the bundled prefix fixture uses a POSIX current symlink" : false;
const SHELL = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")).version;
const FIXTURE_ID = `${SHELL}-1.1.0`;
const FAKE_PI = [
	"const args = process.argv.slice(2);",
	"if (args.includes('--version')) { console.log('1.1.0'); process.exit(0); }",
	"const pick = ['PATH', 'GENTLE_SHELL_PI', 'GENTLE_PI_AGENTS_PI', 'PI_SKIP_VERSION_CHECK', 'npm_config_prefix', 'PI_CODING_AGENT_DIR'];",
	"console.log(JSON.stringify({ cli: process.argv[1], args, env: Object.fromEntries(pick.map((k) => [k, process.env[k]])) }));",
].join("\n");

function bundledPrefix(t: TestContext, { pi = "1.1.0" } = {}) {
	const base = realpathSync(mkdtempSync(join(tmpdir(), "gentle-shell-bundled-")));
	t.after(() => rmSync(base, { recursive: true, force: true }));
	const home = join(base, "home");
	const root = join(home, ".gentle-shell");
	const version = join(root, "versions", FIXTURE_ID);
	const modules = join(version, "node_modules");
	const shell = join(modules, ".pnpm", `gentle-pi@${SHELL}`, "node_modules", "gentle-pi");
	mkdirSync(join(shell, "bin"), { recursive: true });
	writeFileSync(join(shell, "bin", "gentle-shell.mjs"), readFileSync(join(repository, "bin", "gentle-shell.mjs")));
	writeFileSync(join(shell, "package.json"), readFileSync(join(repository, "package.json")));
	for (const dir of ["runtime", "scripts"]) symlinkSync(join(repository, dir), join(shell, dir));
	symlinkSync(shell, join(modules, "gentle-pi"));
	const piDir = join(modules, "@earendil-works", "pi-coding-agent");
	mkdirSync(join(piDir, "dist", "bundle"), { recursive: true });
	writeFileSync(join(piDir, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: pi, bin: { pi: "dist/bundle/cli.js" } }));
	writeFileSync(join(piDir, "dist", "bundle", "cli.js"), FAKE_PI);
	writeFileSync(join(version, "package.json"), JSON.stringify({ dependencies: { "gentle-pi": SHELL, "@earendil-works/pi-coding-agent": "1.1.0" } }));
	writeFileSync(join(version, ".gentle-shell-version"), `${FIXTURE_ID}\n`);
	symlinkSync(`versions/${FIXTURE_ID}`, join(root, "current"));
	// A Pi on PATH and in GENTLE_SHELL_PI that must never run.
	const userBin = join(base, "user-bin");
	mkdirSync(userBin);
	writeFileSync(join(userBin, "pi"), "#!/bin/sh\necho 9.9.9\n", { mode: 0o755 });
	const env = { HOME: home, PATH: `${userBin}:/usr/bin:/bin`, GENTLE_SHELL_PI: join(userBin, "pi"), GENTLE_SHELL_NO_AUTO_SETUP: "1" };
	const entry = join(root, "current", "node_modules", "gentle-pi", "bin", "gentle-shell.mjs");
	const run = (args: string[]) => spawnSync(process.execPath, [entry, ...args], { env, encoding: "utf8", input: "" });
	return { root, version, piDir, run, entry: join(shell, "bin", "gentle-shell.mjs") };
}

test("the bundled launcher runs only its version's Pi, with the bundled environment", { skip: posixHost }, (t) => {
	const prefix = bundledPrefix(t);
	const version = prefix.run(["--version"]);
	assert.equal(version.status, 0, version.stderr);
	assert.match(version.stdout, new RegExp(`^gentle-shell ${SHELL.replaceAll(".", "\\.")}\npi 1\\.1\\.0\n`));
	const launched = prefix.run(["list"]);
	assert.equal(launched.status, 0, launched.stderr);
	const seen = JSON.parse(launched.stdout.trim().split("\n").at(-1) ?? "{}");
	assert.equal(seen.cli, join(realpathSync(prefix.piDir), "dist", "bundle", "cli.js"));
	assert.deepEqual(seen.args, ["list"]);
	assert.equal(seen.env.GENTLE_SHELL_PI, undefined);
	assert.equal(seen.env.PI_SKIP_VERSION_CHECK, "1");
	assert.equal(seen.env.GENTLE_PI_AGENTS_PI, `${process.execPath} ${seen.cli}`);
	assert.equal(seen.env.npm_config_prefix, join(prefix.root, "npm", "prefix"));
	assert.deepEqual(seen.env.PATH.split(":").slice(1, 2), [join(prefix.root, "versions", FIXTURE_ID, "node_modules", ".bin")]);
});

test("the bundled launcher refuses a Pi that is not the pinned one", { skip: posixHost }, (t) => {
	const result = bundledPrefix(t, { pi: "1.0.0" }).run(["--version"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, new RegExp(`Gentle Shell ${FIXTURE_ID.replaceAll(".", "\\.")} .*gentle-shell upgrade`, "s"));
	assert.doesNotMatch(result.stdout, /9\.9\.9/);
});

test("gentle-shell update in a bundled install explains the pinned Pi instead of updating it", { skip: posixHost }, (t) => {
	const result = bundledPrefix(t).run(["update"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Pi ships pinned with Gentle Shell \(Pi 1\.1\.0\)/);
	assert.match(result.stdout, /Run 'gentle-shell upgrade'/);
	assert.doesNotMatch(result.stdout, /"args"/);
});

test("a kept version that current does not name keeps the ordinary launcher, Pi override and Pi update included", { skip: posixHost }, (t) => {
	const prefix = bundledPrefix(t);
	const other = join(prefix.root, "versions", "0.0.1-1.0.0");
	mkdirSync(other);
	writeFileSync(join(other, ".gentle-shell-version"), "0.0.1-1.0.0\n");
	rmSync(join(prefix.root, "current"));
	symlinkSync("versions/0.0.1-1.0.0", join(prefix.root, "current"));
	const update = spawnSync(process.execPath, [prefix.entry, "update"], { env: { HOME: dirname(prefix.root), PATH: "/usr/bin:/bin",
		GENTLE_SHELL_PI: join(dirname(dirname(prefix.root)), "user-bin", "pi"), GENTLE_SHELL_NO_AUTO_SETUP: "1" }, encoding: "utf8", input: "" });
	assert.equal(update.status, 0, update.stderr);
	assert.equal(update.stdout, "9.9.9\n");
});

test("gentle-shell upgrade in a bundled install refuses the main channel and rolls back to the kept version", { skip: posixHost }, (t) => {
	const prefix = bundledPrefix(t);
	const main = prefix.run(["upgrade", "--channel", "main"]);
	assert.equal(main.status, 1);
	assert.match(main.stderr, /release channel only/);
	const none = prefix.run(["upgrade", "--rollback"]);
	assert.equal(none.status, 1);
	assert.match(none.stderr, /No previous Gentle Shell version/);
	assert.equal(readlinkSync(join(prefix.root, "current")), `versions/${FIXTURE_ID}`);
});
