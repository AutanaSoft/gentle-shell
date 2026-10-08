// Main channel: Gentle Shell and Gentle AI built from the latest `main` commits.
//
// Neither repository publishes main builds, so both are produced locally from
// an exact commit SHA resolved at install or upgrade time:
//   - Gentle AI: `go install <module>@<sha>` in a sealed Go environment, so the
//     module source is verified by Go's checksum database (sum.golang.org), as
//     the Windows release build already is. The binary must report a version
//     naming that commit, then it is activated through the existing dev-binary
//     override, which never falls back to the pinned binary silently.
//   - Gentle Shell: the exact commit's source tarball, versioned
//     `<version>-main.<sha12>` and packed without `prepack` (which runs the full
//     test suite), then installed globally like any local tarball.
// The recorded channel lets `gentle-shell upgrade` follow release or main.
import { dirname, join } from "node:path";
import { registerGentleAiDevBinary } from "../runtime/gentle-ai-binary.mjs";

export const SHELL_REPOSITORY = "Gentleman-Programming/gentle-shell";
export const GENTLE_AI_REPOSITORY = "Gentleman-Programming/gentle-ai";
export const GENTLE_AI_MAIN_PACKAGE = "github.com/gentleman-programming/gentle-ai/v4/cmd/gentle-ai";
export const CHANNEL_SCHEMA = "gentle-shell.channel/v1";
export const CHANNELS = Object.freeze(["release", "main"]);

const SHA = /^[0-9a-f]{40}$/;
const MINUTE = 60_000;
const deadlines = Object.freeze({ build: 15 * MINUTE, version: 30_000, extract: 2 * MINUTE, pack: 5 * MINUTE });
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

export class MainChannelError extends Error {
	constructor(code, message) {
		super(`${code}: ${message}`);
		this.name = "MainChannelError";
		this.code = code;
	}
}

/** Same config home as the dev-binary override: GENTLE_PI_CONFIG_HOME or ~/.pi/gentle-ai. */
export function configHome({ env, home }) {
	return env.GENTLE_PI_CONFIG_HOME ?? join(home, ".pi", "gentle-ai");
}
export function channelStatePath(ctx) {
	return join(configHome(ctx), "channel.json");
}

function validState(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value) || value.schema !== CHANNEL_SCHEMA) return null;
	if (value.channel === "release" && Object.keys(value).length === 2) return { channel: "release" };
	if (value.channel === "main" && Object.keys(value).length === 4 && SHA.test(value.shellCommit) && SHA.test(value.gentleAiCommit)) {
		return { channel: "main", shellCommit: value.shellCommit, gentleAiCommit: value.gentleAiCommit };
	}
	return null;
}

/** The recorded channel; no record means release. A malformed record fails closed. */
export async function readChannel(ctx, fs) {
	let text;
	try {
		text = await fs.readFile(channelStatePath(ctx), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return { channel: "release" };
		throw new MainChannelError("channel-state-invalid", `${channelStatePath(ctx)} could not be read`);
	}
	let parsed = null;
	try { parsed = validState(JSON.parse(text)); } catch { parsed = null; }
	if (!parsed) throw new MainChannelError("channel-state-invalid", `${channelStatePath(ctx)} is not a valid ${CHANNEL_SCHEMA} record; fix or remove it`);
	return parsed;
}

export async function writeChannel(ctx, state, fs) {
	const record = { schema: CHANNEL_SCHEMA, ...state };
	if (!validState(record)) throw new MainChannelError("channel-state-invalid", "refusing to record an invalid channel state");
	const path = channelStatePath(ctx);
	await fs.mkdir(dirname(path), { recursive: true });
	await fs.writeFile(`${path}.tmp`, `${JSON.stringify(record)}\n`);
	await fs.rename(`${path}.tmp`, path);
}

/** Latest commit of `main` as an exact SHA (GitHub's raw-SHA media type). */
export async function resolveMainCommit(repository, { fetch }) {
	let response;
	try {
		response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, {
			headers: { Accept: "application/vnd.github.sha", "User-Agent": "gentle-shell" },
		});
	} catch {
		throw new MainChannelError("main-commit-unavailable", `the latest main commit of ${repository} could not be fetched`);
	}
	const sha = response?.ok ? String(await response.text()).trim() : "";
	if (!SHA.test(sha)) {
		throw new MainChannelError("main-commit-unavailable", `GitHub did not return the latest main commit of ${repository} (HTTP ${response?.status ?? "error"})`);
	}
	return sha;
}

export function mainVersion(baseVersion, commit) {
	return `${baseVersion}-main.${commit.slice(0, 12)}`;
}

function succeeded(result) {
	return result?.code === 0 && result.timedOut !== true && result.signal == null;
}

function sealedGoEnvironment(goPath, buildDirectory, platform) {
	const temporary = join(buildDirectory, "tmp");
	const base = {
		// -modcacherw: Go makes its module cache read-only, which would stop its removal.
		GOENV: "off", GOFLAGS: "-modcacherw", GOWORK: "off", GOTOOLCHAIN: "local", GOSUMDB: "sum.golang.org",
		GONOSUMDB: "", GOPRIVATE: "", GONOPROXY: "", GOINSECURE: "", GOPROXY: "https://proxy.golang.org", CGO_ENABLED: "0",
		GOBIN: join(buildDirectory, "gobin"), GOPATH: join(buildDirectory, "gopath"),
		GOMODCACHE: join(buildDirectory, "gomodcache"), GOCACHE: join(buildDirectory, "gocache"),
	};
	if (platform === "win32") {
		const root = process.env.SystemRoot ?? "C:\\Windows";
		return { ...base, SystemRoot: root, TEMP: temporary, TMP: temporary, PATH: [dirname(goPath), join(root, "System32"), root].join(";") };
	}
	return { ...base, HOME: buildDirectory, TMPDIR: temporary, PATH: [dirname(goPath), "/usr/bin", "/bin"].join(":") };
}

/** Builds Gentle AI from `commit`, verifies the binary names it and registers it as the override. */
export async function buildMainGentleAi({ commit, ctx, platform, goPath, run, fs }) {
	if (!SHA.test(commit)) throw new MainChannelError("main-gentle-ai-unverified", "the Gentle AI commit is not an exact SHA");
	const executable = platform === "win32" ? "gentle-ai.exe" : "gentle-ai";
	const directory = join(configHome(ctx), "main", "gentle-ai", commit);
	const buildDirectory = join(configHome(ctx), "main", ".build");
	await fs.rm(buildDirectory, { recursive: true, force: true });
	const env = sealedGoEnvironment(goPath, buildDirectory, platform);
	for (const path of [env.GOBIN, env.GOPATH, env.GOMODCACHE, env.GOCACHE, join(buildDirectory, "tmp")]) await fs.mkdir(path, { recursive: true });
	try {
		const install = await run(goPath, ["install", `${GENTLE_AI_MAIN_PACKAGE}@${commit}`], { env, cwd: buildDirectory, deadlineMs: deadlines.build });
		if (!succeeded(install)) throw new MainChannelError("main-gentle-ai-build-failed", `go install ${GENTLE_AI_MAIN_PACKAGE}@${commit} failed`);
		await fs.mkdir(directory, { recursive: true });
		const binaryPath = join(directory, executable);
		await fs.copyFile(join(env.GOBIN, executable), binaryPath);
		if (platform !== "win32") await fs.chmod(binaryPath, 0o755);
		// Go stamps the module pseudo-version, whose suffix is the commit's first 12 characters.
		const probe = await run(binaryPath, ["version"], { env: { PATH: env.PATH }, deadlineMs: deadlines.version });
		const match = succeeded(probe) && /^gentle-ai (\S+)$/m.exec(String(probe.stdout ?? ""));
		if (!match || !match[1].endsWith(`-${commit.slice(0, 12)}`)) {
			await fs.rm(directory, { recursive: true, force: true });
			throw new MainChannelError("main-gentle-ai-unverified", `the built Gentle AI does not report commit ${commit.slice(0, 12)}`);
		}
		registerGentleAiDevBinary(binaryPath, ctx, platform);
		return { binaryPath, version: match[1] };
	} finally {
		await fs.rm(buildDirectory, { recursive: true, force: true });
	}
}

/** Packs Gentle Shell from `commit` as `<version>-main.<sha12>` without running `prepack`. */
export async function packMainShell({ commit, ctx, fetch, run, pnpm, fs }) {
	if (!SHA.test(commit)) throw new MainChannelError("main-shell-pack-failed", "the Gentle Shell commit is not an exact SHA");
	const packages = join(configHome(ctx), "main", "packages");
	const work = join(configHome(ctx), "main", ".source");
	await fs.rm(work, { recursive: true, force: true });
	await fs.mkdir(join(work, "src"), { recursive: true });
	await fs.mkdir(packages, { recursive: true });
	try {
		let response;
		try {
			response = await fetch(`https://codeload.github.com/${SHELL_REPOSITORY}/tar.gz/${commit}`, { headers: { "User-Agent": "gentle-shell" } });
		} catch {
			response = null;
		}
		const bytes = response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
		if (!bytes || bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
			throw new MainChannelError("main-shell-download-failed", `the Gentle Shell source for ${commit.slice(0, 12)} could not be downloaded`);
		}
		const archive = join(work, "source.tgz");
		await fs.writeFile(archive, bytes);
		const source = join(work, "src");
		if (!succeeded(await run("tar", ["-xzf", archive, "-C", source, "--strip-components=1"], { deadlineMs: deadlines.extract }))) {
			throw new MainChannelError("main-shell-pack-failed", "the Gentle Shell source archive could not be extracted");
		}
		const manifestPath = join(source, "package.json");
		const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
		if (manifest?.name !== "gentle-pi" || typeof manifest.version !== "string") {
			throw new MainChannelError("main-shell-pack-failed", "the downloaded source is not the gentle-pi package");
		}
		manifest.version = mainVersion(manifest.version, commit);
		// prepack runs the full test suite; postinstall (the native binary) stays.
		if (manifest.scripts) {
			delete manifest.scripts.prepack;
			delete manifest.scripts.prepare;
		}
		await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
		const pack = await run(pnpm.command, [...pnpm.prefix, "pack", "--pack-destination", packages], { cwd: source, deadlineMs: deadlines.pack });
		const tgz = join(packages, `gentle-pi-${manifest.version}.tgz`);
		if (!succeeded(pack) || !(await fs.stat(tgz).then((info) => info.isFile(), () => false))) {
			throw new MainChannelError("main-shell-pack-failed", "the Gentle Shell main package could not be packed");
		}
		return tgz;
	} finally {
		await fs.rm(work, { recursive: true, force: true });
	}
}
