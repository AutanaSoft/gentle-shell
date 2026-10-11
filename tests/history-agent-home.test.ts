import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// S9: the store, its legacy files and the transcript scan follow the agent
// home Pi runs with (PI_CODING_AGENT_DIR), not always ~/.pi/agent.

// The OS home is a temporary folder before the extension is imported, so even
// a resolver that ignores PI_CODING_AGENT_DIR (or reads the OS home at import)
// can never write into the real home.
const osHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-history-os-home-"));
const previousHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
process.env.HOME = osHome;
process.env.USERPROFILE = osHome;
const { default: promptHistoryExtension } = await import("../extensions/history/index.ts");
after(() => {
  for (const [name, value] of Object.entries(previousHome)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(osHome, { recursive: true, force: true });
});

type Handler = (...args: unknown[]) => unknown;

test("prompt history lives under the agent home Pi runs with", async (t) => {
  const agentHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-history-agent-home-"));
  t.after(() => fs.rmSync(agentHome, { recursive: true, force: true }));
  const handlers = new Map<string, Handler[]>();
  const pi = {
    on: (name: string, handler: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerShortcut: () => {},
    registerCommand: () => {},
  };
  promptHistoryExtension(pi as never, {
    env: { GENTLE_PI_HISTORY_CAPTURE: "1", PI_CODING_AGENT_DIR: agentHome },
    cwd: "/pi-history-test/project-agent-home",
    instanceId: "inst-agent-home",
    now: () => 1700000000000,
    gentlePiConfigHome: fs.mkdtempSync(path.join(os.tmpdir(), "pi-history-agent-home-config-")),
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const handler of handlers.get("before_agent_start") ?? []) await handler({ prompt: "agent home prompt" }, {});
  assert.equal(fs.existsSync(path.join(osHome, ".pi")), false, "nothing under the OS home");
  const store = path.join(agentHome, "history");
  const files = fs.readdirSync(store, { recursive: true }).map(String)
    .map((file) => path.join(store, file))
    .filter((file) => fs.statSync(file).isFile());
  assert.ok(files.some((file) => fs.readFileSync(file, "utf8").includes("agent home prompt")), JSON.stringify(files));
});
