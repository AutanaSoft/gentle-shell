import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, readdirSync, rmSync, lstatSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import test from "node:test";
import { artifactFor, verifiedDownload, compatibleEngine, ensurePnpm, launchWizard } from "../scripts/installer-downloads.mjs";

const script = resolve("scripts/bootstrap.sh");
const helper = resolve("scripts/installer-downloads.mjs");
const node = process.execPath;
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "bootstrap space ü-"));
	const bin = join(root, "utilities");
	const home = join(root, "home ü");
	const bundle = join(root, "bundle ü");
	for (const dir of [bin, home, join(bundle, "scripts"), join(bundle, "bin")]) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(join(bundle, "scripts/bootstrap.sh"), readFileSync(script));
	writeFileSync(join(bundle, "scripts/installer-downloads.mjs"), readFileSync(helper));
	writeFileSync(join(bundle, "package.json"), JSON.stringify({ engines: { node: ">=22.19.0" }, packageManager: "pnpm@11.1.1" }));
	for (const name of ["dirname", "pwd", "awk", "mkdir", "mktemp", "chmod", "mv", "rm", "sleep", "wc", "cat", "id", "ls"])
		symlinkSync(`/usr/bin/${name}`, join(bin, name));
	const executable = (name: string, body: string) => {
		const path = join(bin, name);
		if (existsSync(path) && lstatSync(path).isSymbolicLink()) unlinkSync(path);
		writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
	};
	executable("uname", 'case "$1" in -s) printf "%s\\n" "${FAKE_OS:-Linux}";; -m) printf "%s\\n" "${FAKE_ARCH:-x86_64}";; esac');
	executable("getconf", 'printf "%s\\n" "${FAKE_LIBC:-glibc 2.36}"');
	executable("curl", 'while [ "$#" -gt 0 ]; do if [ "$1" = "--output" ]; then shift; out=$1; fi; shift; done\nprintf archive > "$out"\nexit "${DOWNLOAD_STATUS:-0}"');
	executable("sha256sum", 'printf "%s  archive\\n" "${FAKE_HASH:-6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff}"');
	const nodeBody = `#!/bin/sh\nif [ "$1" = --version ]; then\nif [ -n "\${NODE_PROBE_SCRIPT:-}" ]; then exec '${node}' "$NODE_PROBE_SCRIPT"; fi\nprintf '%s\\n' "\${NODE_VERSION:-v24.21.0}"; else exec '${node}' "$@"; fi\n`;
	executable("tar", `if [ "$1" = -tzf ]; then printf '%s\\n' "$3"; elif [ "$1" = -tvzf ]; then printf '%s\\n' '-rwxr-xr-x node'; else\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -C ]; then shift; target=$1; fi; member=$1; shift; done\nmkdir -p "$target/\${member%/node}"\ncat > "$target/$member" <<'NODE'\n${nodeBody}NODE\nchmod 700 "$target/$member"\nfi`);
	const addNode = () => writeFileSync(join(bin, "node"), nodeBody, { mode: 0o755 });
	const addPnpm = (version = "11.1.1", engine = ">=22.13.0") => {
		const pkg = join(root, "pnpm package");
		mkdirSync(join(pkg, "bin"), { recursive: true });
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "pnpm", version, engines: { node: engine } }));
		writeFileSync(join(pkg, "bin/pnpm.mjs"), `#!/bin/sh\ncase "$1" in --version) echo '${version}';; help) echo ' --global '; esac\n`, { mode: 0o755 });
		symlinkSync(join(pkg, "bin/pnpm.mjs"), join(bin, "pnpm"));
	};
	const wizard = () => writeFileSync(join(bundle, "bin/gentle-shell-install.mjs"), "console.log('wizard-child:' + process.env.PATH);\n");
	const run = (extra: Record<string, string> = {}) => spawnSync("/bin/sh", [join(bundle, "scripts/bootstrap.sh")], {
		env: { PATH: bin, HOME: home, ...extra }, encoding: "utf8", timeout: 15000,
	});
	return { root, bin, home, bundle, executable, addNode, addPnpm, wizard, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

for (const [os, arch, target] of [["darwin", "x64", "darwin-x64"], ["darwin", "arm64", "darwin-arm64"], ["linux", "x64", "linux-x64"], ["linux", "arm64", "linux-arm64"]]) {
	test(`fixed Node descriptor for ${target}`, () => {
		const artifact = artifactFor("node", os, arch);
		assert.match(artifact.url, new RegExp(`^https://nodejs.org/dist/v24\\.21\\.0/node-v24\\.21\\.0-${target}\\.tar\\.gz$`));
		assert.match(artifact.integrity, /^sha256-[a-f0-9]{64}$/);
	});
}
test("unknown targets and caller URLs are rejected", () => {
	assert.throws(() => artifactFor("node", "linux", "ia32"), /Unsupported/);
	assert.throws(() => artifactFor("https://untrusted.example"), /Unsupported/);
});
test("engine evidence supports stable lower bounds, not guessed ranges", () => {
	assert.equal(compatibleEngine(">=22.13.0", "24.21.0"), true);
	assert.equal(compatibleEngine(">=25.0.0", "24.21.0"), false);
	assert.equal(compatibleEngine("*", "24.21.0"), false);
	assert.equal(compatibleEngine(">=22.13.0", "24.0.0-rc.1"), false);
});
test("pnpm descriptor preserves the literal upstream Node engine", () => {
	assert.equal(artifactFor("pnpm").engine, ">=22.13");
});
test("simple partial engine minima normalize only for stable version comparison", () => {
	assert.equal(compatibleEngine(">=22.13", "22.13.0"), true);
	assert.equal(compatibleEngine(">=22.13", "24.21.0"), true);
	for (const version of ["22.12.0", "22.12.99", "22.13.0-rc.1", "24.0.0-rc.1", "unknown", "22.13"]) {
		assert.equal(compatibleEngine(">=22.13", version), false, version);
	}
	for (const range of ["*", ">=22", ">=22.13 || >=24", ">=22.13 <25", "^22.13", ">=22.x", ">=22.13-rc.1", ">=022.13", ">=22.013", ">=22.13.00", ">=9007199254740992.13"]) {
		assert.equal(compatibleEngine(range, "24.21.0"), false, range);
	}
});
test("download helper fails closed on integrity, empty body and adapter failure", async () => {
	for (const download of [async () => Buffer.from("truncated"), async () => Buffer.alloc(0), async () => { throw Error("failure"); }]) {
		await assert.rejects(verifiedDownload("pnpm", { download }), /Download|integrity/);
	}
});
test("download helper validates bytes before returning them", async () => {
	const bytes = Buffer.from("verified fixture");
	let observed = "";
	const result = await verifiedDownload("pnpm", {
		download: async (descriptor: { url: string }) => { observed = descriptor.url; return bytes; },
		digest: () => Buffer.from(artifactFor("pnpm").integrity.slice(7), "base64"),
	});
	assert.equal(result, bytes);
	assert.equal(observed, "https://registry.npmjs.org/pnpm/-/pnpm-11.1.1.tgz");
	assert.notEqual(createHash("sha512").update(bytes).digest("base64"), artifactFor("pnpm").integrity.slice(7));
});

test("compatible existing tools are reused with whitespace and Unicode paths", () => {
	const f = fixture();
	try {
		f.addNode(); f.addPnpm("12.0.0"); f.wizard();
		const result = f.run();
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /wizard-child:/);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
test("missing wizard fails explicitly without acquiring or claiming installation", () => {
	const f = fixture();
	try {
		const result = f.run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /wizard entry.*missing/i);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
test("no initial Node acquires verified native binary and refreshes child PATH", () => {
	const f = fixture();
	try {
		f.addPnpm(); f.wizard();
		const result = f.run();
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /wizard-child:.*bootstrap-tools.*node\/bin/);
		assert.equal(readdirSync(f.home).length, 1);
	} finally { f.cleanup(); }
});
for (const extra of [{ FAKE_HASH: "0".repeat(64) }, { DOWNLOAD_STATUS: "18" }, { NODE_VERSION: "v21.0.0" }, { NODE_VERSION: "unknown" }, { FAKE_LIBC: "musl" }]) {
	test(`acquisition fails closed: ${JSON.stringify(extra)}`, () => {
		const f = fixture();
		try {
			f.addPnpm(); f.wizard();
			const result = f.run(extra);
			assert.notEqual(result.status, 0);
			assert.doesNotMatch(result.stdout, /wizard-child/);
			assert.deepEqual(readdirSync(f.home), []);
		} finally { f.cleanup(); }
	});
}
for (const version of ["v22.18.0", "v24.1.0-rc.1", "v25.00.1", "banana"]) {
	test(`existing Node ${version} is rejected without replacement`, () => {
		const f = fixture();
		try {
			f.addNode(); f.addPnpm(); f.wizard();
			const result = f.run({ NODE_VERSION: version });
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /Node.*incompatible|Node.*unknown/);
			assert.deepEqual(readdirSync(f.home), []);
		} finally { f.cleanup(); }
	});
}
test("existing pnpm with unknown engine blocks instead of acquisition", () => {
	const f = fixture();
	try {
		f.addNode(); f.addPnpm("12.0.0", "*"); f.wizard();
		const result = f.run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /pnpm.*compatibility/i);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
test("missing required shell utility is named", () => {
	const f = fixture();
	try {
		f.wizard();
		unlinkSync(join(f.bin, "curl"));
		const result = f.run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Required utility missing: curl/);
	} finally { f.cleanup(); }
});
test("symlink HOME and conflicting staging are refused without touching targets", () => {
	const f = fixture();
	try {
		f.addPnpm(); f.wizard();
		const link = join(f.root, "linked-home"); symlinkSync(f.home, link);
		assert.match(f.run({ HOME: link }).stderr, /symlink|unsafe/i);
		f.executable("mktemp", `printf '%s\\n' '${f.bin}'`);
		const result = f.run();
		assert.notEqual(result.status, 0);
		assert.ok(existsSync(join(f.bin, "pnpm")));
	} finally { f.cleanup(); }
});
test("pnpm acquisition refuses conflicting and symlink destinations before download", async () => {
	const f = fixture();
	try {
		mkdirSync(join(f.home, "pnpm"));
		let downloads = 0;
		await assert.rejects(ensurePnpm({ tools: f.home, env: { PATH: f.bin }, nodeVersion: "24.21.0", adapters: {
			download: async () => { downloads += 1; return Buffer.alloc(0); },
		} }), /destination/);
		assert.equal(downloads, 0);
	} finally { f.cleanup(); }
});
test("wizard child failure is propagated and missing entry is explicit", async () => {
	await assert.rejects(launchWizard({ bundle: "/missing-bundle", env: {} }), /wizard entry.*missing/i);
	const f = fixture();
	try {
		writeFileSync(join(f.bundle, "bin/gentle-shell-install.mjs"), "process.exit(7);\n");
		await assert.rejects(launchWizard({ bundle: f.bundle, env: {} }), /Wizard child failed/);
		f.addPnpm();
		assert.notEqual(f.run().status, 0);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});

for (const [os, arch, platform, architecture] of [["Darwin", "arm64", "darwin", "arm64"], ["Darwin", "x86_64", "darwin", "x64"], ["Linux", "aarch64", "linux", "arm64"]]) {
	test(`shell artifact selection ${os}/${arch} (simulated, not native proof)`, () => {
		const f = fixture();
		try {
			f.addPnpm(); f.wizard();
			const hash = artifactFor("node", platform, architecture).integrity.slice(7);
			assert.equal(f.run({ FAKE_OS: os, FAKE_ARCH: arch, FAKE_HASH: hash }).status, 0);
		} finally { f.cleanup(); }
	});
}
for (const extra of [{ FAKE_ARCH: "riscv64" }, { FAKE_OS: "FreeBSD" }, { FAKE_LIBC: "glibc 2.27" }]) {
	test(`unsupported acquisition blocks before download: ${JSON.stringify(extra)}`, () => {
		const f = fixture();
		try {
			f.wizard();
			assert.notEqual(f.run(extra).status, 0);
			assert.deepEqual(readdirSync(f.home), []);
		} finally { f.cleanup(); }
	});
}
for (const [utility, body, message] of [
	["curl", 'while [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then shift; out=$1; fi; shift; done; : > "$out"', /download/i],
	["sha256sum", "exit 2", /SHA256 process failed/],
	["tar", "exit 2", /archive is invalid/],
	["tar", "echo 'lrwxrwxrwx malicious-link'", /not a regular file/],
]) {
	test(`native acquisition process rejection: ${utility}/${message}`, () => {
		const f = fixture();
		try {
			f.addPnpm(); f.wizard(); f.executable(utility, body);
			const result = f.run();
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, message);
			assert.deepEqual(readdirSync(f.home), []);
		} finally { f.cleanup(); }
	});
}

interface AcquisitionOptions {
	names?: string;
	types?: string;
	version?: string;
	help?: string;
	failProcess?: boolean;
}
function acquisitionAdapters(options: AcquisitionOptions = {}) {
	const calls: string[] = [];
	return {
		calls,
		download: async () => Buffer.from("verified fixture"),
		digest: () => Buffer.from(artifactFor("pnpm").integrity.slice(7), "base64"),
		process: (command: string, args: string[]) => {
			calls.push(`${command}:${args[0]}`);
			if (options.failProcess) throw Error("injected process failure");
			if (args[0] === "-tzf") return options.names ?? "package/\npackage/package.json\npackage/bin/pnpm.mjs";
			if (args[0] === "-tvzf") return options.types ?? "drwx------ package/\n-rw------- package/package.json\n-rwx------ package/bin/pnpm.mjs";
			if (args[0] === "-xzf") {
				const pkg = join(args[3], "package");
				mkdirSync(join(pkg, "bin"), { recursive: true, mode: 0o700 });
				// Literal parent-verified upstream metadata, intentionally not descriptor-derived.
				writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "pnpm", version: "11.1.1", engines: { node: ">=22.13" } }));
				writeFileSync(join(pkg, "bin/pnpm.mjs"), "console.log(process.argv.includes('--version') ? '11.1.1' : '--global');\n");
				return "";
			}
			if (args.includes("--version")) return options.version ?? "11.1.1";
			return options.help ?? "--global";
		},
	};
}
test("verified pnpm with literal upstream >=22.13 engine publishes its owned wrapper", async () => {
	const f = fixture();
	try {
		const adapters = acquisitionAdapters();
		const result = await ensurePnpm({ tools: f.home, env: { PATH: f.bin }, nodeVersion: "24.21.0", adapters });
		assert.equal(result.acquired, true);
		assert.ok(result.env.PATH.startsWith(join(f.home, "pnpm/bin")));
		assert.deepEqual(readdirSync(f.home), ["pnpm"]);
		const wrapper = join(f.home, "pnpm/bin/pnpm");
		assert.equal(spawnSync(wrapper, ["--version"], { encoding: "utf8" }).stdout.trim(), "11.1.1");
		assert.ok(adapters.calls.every((call) => call.startsWith(join(f.bin, "tar")) || call.startsWith(node)));
	} finally { f.cleanup(); }
});
for (const options of [{ names: "package/../escape" }, { names: "/absolute/path" }, { types: "lrwxrwxrwx package/link" }, { types: "hrw------- package/hardlink" }, { version: "11.1.0" }, { help: "--global-bin-dir" }, { failProcess: true }]) {
	test(`pnpm extraction/validation fails without publication: ${JSON.stringify(options)}`, async () => {
		const f = fixture();
		try {
			await assert.rejects(ensurePnpm({ tools: f.home, env: { PATH: f.bin }, nodeVersion: "24.21.0", adapters: acquisitionAdapters(options) }), /acquisition failed/);
			assert.deepEqual(readdirSync(f.home), []);
		} finally { f.cleanup(); }
	});
}
test("pnpm symlink conflict does not touch its target", async () => {
	const f = fixture();
	try {
		symlinkSync(f.bin, join(f.home, "pnpm"));
		await assert.rejects(ensurePnpm({ tools: f.home, env: { PATH: f.bin }, nodeVersion: "24.21.0", adapters: acquisitionAdapters() }), /destination/);
		assert.ok(existsSync(join(f.bin, "curl")));
	} finally { f.cleanup(); }
});
test("native Node destination symlink is refused without following its target", () => {
	const f = fixture();
	try {
		f.addPnpm(); f.wizard();
		const tar = readFileSync(join(f.bin, "tar"), "utf8");
		f.executable("tar", tar.replace('mkdir -p "$target/', `/usr/bin/ln -s '${f.bin}' "$target/../node"\nmkdir -p "$target/`));
		const result = f.run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Conflicting Node destination/);
		assert.ok(existsSync(join(f.bin, "pnpm")));
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
test("existing Node failed probe is not repaired", () => {
	const f = fixture();
	try {
		f.addNode(); f.wizard(); f.executable("node", "exit 4");
		assert.match(f.run().stderr, /Existing Node version probe failed/);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
test("pnpm without required global capabilities is not replaced", () => {
	const f = fixture();
	try {
		f.addNode(); f.addPnpm(); f.wizard();
		writeFileSync(join(f.bin, "pnpm"), "#!/bin/sh\n[ \"$1\" != --version ] || echo 11.1.1\n", { mode: 0o755 });
		assert.match(f.run().stderr, /capability evidence missing/);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
test("missing tar blocks pnpm before any download", async () => {
	const f = fixture();
	try {
		unlinkSync(join(f.bin, "tar"));
		let downloaded = false;
		await assert.rejects(ensurePnpm({ tools: f.home, env: { PATH: f.bin }, nodeVersion: "24.21.0", adapters: {
			download: async () => { downloaded = true; return Buffer.alloc(0); },
		} }), /Required utility missing: tar/);
		assert.equal(downloaded, false);
	} finally { f.cleanup(); }
});
test("oversized verified-download input is rejected before digest", async () => {
	let hashed = false;
	await assert.rejects(verifiedDownload("pnpm", {
		download: async () => Buffer.alloc(artifactFor("pnpm").maxBytes + 1),
		digest: () => { hashed = true; return Buffer.alloc(0); },
	}), /size rejected/);
	assert.equal(hashed, false);
});
interface GuardedResult {
	status: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
	guardKilled: boolean;
	elapsed: number;
}

// Independent asynchronous guard: even a blocked spawnSync inside the fixture
// cannot block this test process. Only this fresh detached fixture group is killed.
async function guardedFixture(command: string, args: string[], env: Record<string, string>, limit: number): Promise<GuardedResult> {
	const start = Date.now();
	const child = spawn(command, args, { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
	const group = child.pid;
	let stdout = "";
	let stderr = "";
	let guardKilled = false;
	const killOwnedGroup = () => {
		if (group === undefined) return;
		try { process.kill(-group, "SIGKILL"); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
	};
	const timer = setTimeout(() => { guardKilled = true; killOwnedGroup(); }, limit);
	child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
	child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
	try {
		return await new Promise<GuardedResult>((resolveChild, reject) => {
			child.once("error", reject);
			child.once("close", (status, signal) => resolveChild({ status, signal, stdout, stderr, guardKilled, elapsed: Date.now() - start }));
		});
	} finally {
		clearTimeout(timer);
		// Also clean residual fixture descendants if the group leader exits early.
		killOwnedGroup();
	}
}
function termIgnoringProbe(root: string, output: string) {
	const probe = join(root, "term-ignoring-probe.mjs");
	const pid = join(root, "owned-probe.pid");
	writeFileSync(probe, `import { writeFileSync } from 'node:fs';\nprocess.on('SIGTERM', () => {});\nwriteFileSync(process.env.PROBE_PID, String(process.pid));\nconsole.log(${JSON.stringify(output)});\nsetInterval(() => {}, 1000);\n`);
	return { probe, pid };
}
function assertProbeReaped(path: string) {
	const pid = Number(readFileSync(path, "utf8"));
	assert.ok(Number.isSafeInteger(pid) && pid > 0);
	assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "owned probe must be reaped before the parent returns");
}

test("production shell deadline rejects TERM-ignored acquired Node and cleans owned tooling", async () => {
	const f = fixture();
	try {
		f.addPnpm(); f.wizard();
		writeFileSync(join(f.home, "unrelated.txt"), "preserve");
		const { probe, pid } = termIgnoringProbe(f.root, "v24.21.0");
		const result = await guardedFixture("/bin/sh", [join(f.bundle, "scripts/bootstrap.sh")], {
			PATH: f.bin, HOME: f.home, NODE_PROBE_SCRIPT: probe, PROBE_PID: pid,
		}, 13000);
		assert.equal(result.guardKilled, false, `shell required outer SIGKILL after ${result.elapsed}ms`);
		assert.equal(result.status, 1);
		assert.equal(result.signal, null);
		assert.match(result.stderr, /Acquired Node cannot execute/);
		assert.doesNotMatch(result.stdout, /wizard-child/);
		assertProbeReaped(pid);
		assert.deepEqual(readdirSync(f.home), ["unrelated.txt"]);
		assert.equal(readFileSync(join(f.home, "unrelated.txt"), "utf8"), "preserve");
	} finally { f.cleanup(); }
});

function productionPnpmRunner(root: string, home: string, bin: string) {
	const runner = join(root, "production-pnpm-runner.mjs");
	// Inject only verified-byte transport/digest, not the production process adapter.
	writeFileSync(runner, `import { artifactFor, ensurePnpm } from ${JSON.stringify(pathToFileURL(helper).href)};\ntry {\nawait ensurePnpm({ tools: ${JSON.stringify(home)}, env: { PATH: ${JSON.stringify(bin)}, PROBE_PID: process.env.PROBE_PID }, nodeVersion: '24.21.0', adapters: {\ndownload: async () => Buffer.from('verified fixture'),\ndigest: () => Buffer.from(artifactFor('pnpm').integrity.slice(7), 'base64'),\n} });\nconsole.log('unexpected acquisition success');\n} catch { console.error('acquisition rejected'); process.exitCode = 1; }\n`);
	return runner;
}
test("production Node process deadline rejects TERM-ignored tar and cleans owned staging", async () => {
	const f = fixture();
	try {
		writeFileSync(join(f.home, "unrelated.txt"), "preserve");
		const { probe, pid } = termIgnoringProbe(f.root, "package/");
		f.executable("tar", `exec '${node}' '${probe}'`);
		const result = await guardedFixture(node, [productionPnpmRunner(f.root, f.home, f.bin)], { PROBE_PID: pid }, 18000);
		assert.equal(result.guardKilled, false, `Node process check required outer SIGKILL after ${result.elapsed}ms`);
		assert.equal(result.status, 1);
		assert.equal(result.signal, null);
		assert.match(result.stderr, /acquisition rejected/);
		assert.doesNotMatch(result.stdout, /unexpected acquisition success/);
		assertProbeReaped(pid);
		assert.deepEqual(readdirSync(f.home), ["unrelated.txt"]);
		assert.equal(readFileSync(join(f.home, "unrelated.txt"), "utf8"), "preserve");
	} finally { f.cleanup(); }
});
test("production Node process adapter propagates ordinary nonzero tar exit with cleanup", async () => {
	const f = fixture();
	try {
		writeFileSync(join(f.home, "unrelated.txt"), "preserve");
		f.executable("tar", "exit 7");
		const result = await guardedFixture(node, [productionPnpmRunner(f.root, f.home, f.bin)], {}, 3000);
		assert.equal(result.guardKilled, false);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /acquisition rejected/);
		assert.deepEqual(readdirSync(f.home), ["unrelated.txt"]);
	} finally { f.cleanup(); }
});

test("failed pnpm download never reaches archive/process adapters", async () => {
	const f = fixture();
	try {
		let processes = 0;
		await assert.rejects(ensurePnpm({ tools: f.home, env: { PATH: f.bin }, nodeVersion: "24.21.0", adapters: {
			download: async () => Buffer.from("truncated"),
			process: () => { processes += 1; return ""; },
		} }), /acquisition failed/);
		assert.equal(processes, 0);
		assert.deepEqual(readdirSync(f.home), []);
	} finally { f.cleanup(); }
});
