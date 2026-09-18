import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureRegistryEntry,
  projectHash,
  registryPath,
} from "../extensions/history/store.ts";

// Slice-1 port note: the dev suite asserted lookups through the dead
// `lookupCwd` export, which slice 1 drops. Every lookup assertion is
// re-expressed against the persisted registry.json content.

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-history-registry-"));
}

function readRegistryFile(root: string): Record<string, string> {
  return JSON.parse(
    fs.readFileSync(registryPath(root), "utf8"),
  ) as Record<string, string>;
}

test("creates the registry with the first entry (idempotent)", () => {
  const root = makeRoot();
  const result = ensureRegistryEntry(root, "/pi-history-test/project-a");
  assert.deepEqual(result, { hash: "4be15ec687e9df85", created: true });
  ensureRegistryEntry(root, "/pi-history-test/project-a");
  assert.deepEqual(readRegistryFile(root), {
    "4be15ec687e9df85": "/pi-history-test/project-a",
  });
});

test("second project appends without touching the first", () => {
  const root = makeRoot();
  ensureRegistryEntry(root, "/pi-history-test/project-a");
  const b = ensureRegistryEntry(root, "/pi-history-test/project-b");
  assert.equal(b.created, true);
  const raw = readRegistryFile(root);
  assert.equal(Object.keys(raw).length, 2);
  assert.equal(raw[b.hash], "/pi-history-test/project-b");
});

test("registry.json maps known hashes and omits unknown ones", () => {
  const root = makeRoot();
  const { hash } = ensureRegistryEntry(root, "/pi-history-test/project-a");
  const raw = readRegistryFile(root);
  assert.equal(raw[hash], "/pi-history-test/project-a");
  assert.equal(raw["0000000000000000"], undefined);
  // A fresh root has no registry file until its first entry lands.
  assert.equal(fs.existsSync(registryPath(makeRoot())), false);
});

test("corrupt registry json is treated as empty and rebuilt on next entry", () => {
  const root = makeRoot();
  fs.writeFileSync(registryPath(root), "{not-json", "utf8");
  const result = ensureRegistryEntry(root, "/pi-history-test/project-a");
  assert.equal(result.created, true);
  // The corrupt content was discarded (fail-open to empty), so the rebuilt
  // registry contains exactly the new entry and nothing else.
  assert.deepEqual(readRegistryFile(root), {
    "4be15ec687e9df85": "/pi-history-test/project-a",
  });
});

test("no leftover tmp files after writes", () => {
  const root = makeRoot();
  ensureRegistryEntry(root, "/a");
  ensureRegistryEntry(root, "/b");
  const leftovers = fs.readdirSync(root).filter((f) => f.includes(".tmp-"));
  assert.deepEqual(leftovers, []);
});

test("hash collision re-keys the existing occupant; the new cwd keeps the short hash", () => {
  const root = makeRoot();
  const cwd = "/pi-history-test/project-a";
  const hash = projectHash(cwd);
  // Simulate a collision: the short hash is pre-mapped to a different cwd.
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    registryPath(root),
    JSON.stringify({ [hash]: "/some/other/project" }),
    "utf8",
  );
  const result = ensureRegistryEntry(root, cwd);
  assert.deepEqual(result, { hash, created: true });
  const raw = readRegistryFile(root);
  assert.equal(raw[hash], cwd);
  const longKeys = Object.keys(raw).filter((k) => k.length === 24);
  assert.equal(longKeys.length, 1);
  assert.equal(raw[longKeys[0]], "/some/other/project");
});

test("wrong-shaped registry (array / scalar / null) fails open and is rebuilt on the next entry", () => {
  // Valid JSON, wrong shape: the readRegistry shape guard treats each as an
  // empty registry, and the next entry rebuilds a valid object-mapped
  // registry around itself.
  const shapes: unknown[] = [["an", "array"], "scalar-string", null];
  const cwd = "/pi-history-test/project-a";
  for (const shape of shapes) {
    const root = makeRoot();
    fs.writeFileSync(registryPath(root), JSON.stringify(shape), "utf8");
    const result = ensureRegistryEntry(root, cwd);
    assert.deepEqual(result, { hash: projectHash(cwd), created: true });
    assert.deepEqual(readRegistryFile(root), { [projectHash(cwd)]: cwd });
  }
});
