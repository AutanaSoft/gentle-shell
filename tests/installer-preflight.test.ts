import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectInventory, planPreflight, pnpmGlobalBin, requirements } from "../scripts/installer-preflight.mjs";

const absent = { available: false };
const tool = (version: string) => ({ available: true, version, usable: true });
function clean(platform = "linux", arch = "x64") {
	return { platform, arch, node: absent, pnpm: absent, pi: absent, shell: absent,
		gentleAi: absent, go: absent, globalBin: absent, setup: false };
}
function installed(platform = "linux") {
	return { ...clean(platform), node: tool("24.1.0"),
		pnpm: { ...tool("12.0.0"), compatible: true }, pi: tool("1.2.0"),
		shell: { ...tool("5.0.0"), global: true },
		gentleAi: { ...tool(requirements.gentleAi), compatible: true },
		globalBin: { available: true, path: "/disposable/bin", writable: true, onPath: true }, setup: true };
}
const ids = (inventory: object) => planPreflight(inventory).actions.map((action: { id: string }) => action.id);

test("requirements follow repository metadata and native installer pin", () => {
	const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
	assert.equal(requirements.node, pkg.engines.node.slice(2));
	assert.equal(requirements.pi, pkg.peerDependencies["@earendil-works/pi-coding-agent"].slice(2));
	assert.equal(requirements.pnpm, pkg.packageManager.split("@")[1]);
	assert.equal(requirements.shell, pkg.version);
	assert.equal(requirements.go, "1.25.10");
});

for (const platform of ["linux", "darwin", "win32"]) {
	for (const arch of ["x64", "arm64"]) {
		test(`clean ${platform}/${arch} has dependency-ordered actions`, () => {
			const plan = planPreflight(clean(platform, arch));
			assert.equal(plan.blockers.length, 0);
			assert.equal(plan.ready, false);
			assert.deepEqual(ids(clean(platform, arch)), ["acquire-node", "verify-node", "acquire-pnpm", "verify-pnpm",
				"setup-global-bin", ...(platform === "win32" ? ["acquire-go", "verify-go"] : []),
				"install-pi", "install-shell", "setup-shell", "verify-readiness"]);
		});
	}
	test(`compatible ${platform} reuses newer global tools without acquiring Go`, () => {
		const inventory = installed(platform);
		const before = structuredClone(inventory);
		const plan = planPreflight(inventory);
		assert.equal(plan.ready, true);
		assert.deepEqual(ids(inventory), ["verify-readiness"]);
		assert.deepEqual(inventory, before);
		assert.equal(plan.tools.node.status, "reusable");
		assert.equal(plan.tools.go.status, "not-required");
	});
}

test("Windows requires compatible Go only before a missing native binary", () => {
	const inventory = { ...installed("win32"), gentleAi: absent, go: tool("1.26.0") };
	assert.equal(planPreflight(inventory).tools.go.status, "reusable");
	assert.deepEqual(ids(inventory), ["provision-native", "setup-shell", "verify-readiness"]);
	assert.ok(planPreflight({ ...inventory, go: tool("1.25.9") }).blockers.some((b: { tool: string }) => b.tool === "go"));
});

for (const [name, version] of [["node", "22.18.0"], ["pi", "0.99.0"], ["shell", "3.9.0"], ["node", "banana"], ["pi", "1.0.0-rc.1"]]) {
	test(`${name} ${version} blocks rather than replacing an existing tool`, () => {
		const inventory = { ...installed(), [name]: tool(version) };
		const plan = planPreflight(inventory);
		assert.ok(plan.blockers.some((b: { tool: string }) => b.tool === name));
		assert.deepEqual(plan.actions, []);
		assert.equal(plan.ready, false);
	});
}

test("missing Windows Go is acquired before reprovisioning an existing Shell", () => {
	const inventory = { ...installed("win32"), gentleAi: absent };
	assert.deepEqual(ids(inventory), ["acquire-go", "verify-go", "provision-native", "setup-shell", "verify-readiness"]);
	for (const go of [tool("devel"), { ...tool("1.26.0"), usable: false }]) {
		assert.equal(planPreflight({ ...inventory, go }).tools.go.status, "unknown");
		assert.deepEqual(ids({ ...inventory, go }), []);
	}
});

test("unknown probes and pnpm compatibility fail closed", () => {
	for (const change of [{ node: undefined }, { pnpm: tool("11.1.1") }, { setup: undefined },
		{ gentleAi: { ...tool("5.0.0"), compatible: false } }, { shell: { ...tool("4.0.0"), global: false } }]) {
		assert.ok(planPreflight({ ...installed(), ...change }).blockers.length > 0);
	}
});

test("global-bin must be writable and reachable; known PATH repair is explicit", () => {
	const inventory = installed();
	assert.deepEqual(ids({ ...inventory, globalBin: { ...inventory.globalBin, onPath: false } }),
		["setup-global-bin", "verify-readiness"]);
	for (const globalBin of [{ ...inventory.globalBin, writable: false }, { available: true }]) {
		assert.deepEqual(planPreflight({ ...inventory, globalBin }).actions, []);
		assert.equal(planPreflight({ ...inventory, globalBin }).tools.globalBin.status, "unknown");
	}
});

test("pnpm global bin is $PNPM_HOME/bin and onPath checks that directory, not $PNPM_HOME", () => {
	const home = "/home/u/.local/share/pnpm";
	assert.deepEqual(pnpmGlobalBin({ platform: "linux", env: { HOME: "/home/u", PATH: `${home}:/usr/bin` } }),
		{ pnpmHome: home, path: `${home}/bin`, onPath: false });
	assert.equal(pnpmGlobalBin({ platform: "linux", env: { HOME: "/home/u", PATH: `/usr/bin:${home}/bin/` } })?.onPath, true);
	assert.equal(pnpmGlobalBin({ platform: "linux", env: { HOME: "/home/u", XDG_DATA_HOME: "/data", PATH: "" } })?.path, "/data/pnpm/bin");
	assert.equal(pnpmGlobalBin({ platform: "darwin", env: { HOME: "/Users/u", PNPM_HOME: "/opt/pnpm", PATH: "/opt/pnpm/bin" } })?.onPath, true);
	assert.equal(pnpmGlobalBin({ platform: "darwin", env: { HOME: "/Users/u" } })?.path, "/Users/u/Library/pnpm/bin");
	assert.deepEqual(pnpmGlobalBin({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local", Path: "c:\\users\\U\\appdata\\local\\PNPM\\Bin\\;C:\\Windows" } }),
		{ pnpmHome: "C:\\Users\\u\\AppData\\Local\\pnpm", path: "C:\\Users\\u\\AppData\\Local\\pnpm\\bin", onPath: true });
	for (const env of [{ PNPM_HOME: "relative/pnpm", HOME: "/home/u" }, { PATH: "/usr/bin" }, { HOME: "relative" }]) {
		assert.equal(pnpmGlobalBin({ platform: "linux", env }), null);
	}
});

test("unsupported targets never offer installation", () => {
	for (const inventory of [clean("freebsd"), clean("linux", "ia32")]) {
		assert.equal(planPreflight(inventory).blockers[0].code, "unsupported-target");
		assert.deepEqual(ids(inventory), []);
	}
});

test("collector invokes only injected named probes, catches failures without logging details", async () => {
	const calls: string[] = [];
	const probes = Object.fromEntries(["node", "pnpm", "pi", "shell", "gentleAi", "go", "globalBin", "setup"].map((name) =>
		[name, async () => { calls.push(name); if (name === "node") throw new Error("private diagnostic"); return absent; }]));
	const inventory = await collectInventory({ platform: "linux", arch: "x64", probes });
	assert.deepEqual(calls, Object.keys(probes));
	assert.deepEqual(inventory.node, { available: null });
	assert.equal(JSON.stringify(inventory).includes("private diagnostic"), false);
	assert.ok(planPreflight(inventory).blockers.length > 0);
});
