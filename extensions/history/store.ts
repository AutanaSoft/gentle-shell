// SPDX-FileCopyrightText: 2026 ExoPro. Inspired by @jasonish/pi-prompt-history
// SPDX-License-Identifier: MIT

// Consolidated multi-concurrency store (v2), slice 1: project paths and
// identity, the advisory registry, entry primitives, and the per-instance
// session writer. Scope drains/deletes, legacy migration and seed
// bootstrap, and GC/compaction arrive in later slices.
// Formerly store-paths.ts + registry.ts + multi-store.ts (+ v1 primitives).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ===========================================================================
// Paths (formerly store-paths.ts)
// ===========================================================================

/**
 * Project identity for the multi-concurrency store (design v2).
 *
 * The cwd is canonicalized through realpath — the same resolution pi's
 * session-manager applies — so symlinked or differently-spelled paths to one
 * project merge into a single identity. A failed resolution (deleted cwd)
 * falls back to hashing the raw string: identity degrades, never throws.
 */
export function projectHash(cwd: string): string {
  let canonical = cwd;
  try {
    canonical = fs.realpathSync(cwd);
  } catch {
    // fall back to the raw path
  }
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** The project's directory under the store root. */
export function projectDir(root: string, cwd: string): string {
  return path.join(root, "projects", projectHash(cwd));
}

/** The capture file owned by one pi instance (per session/process). */
export function sessionFilePath(
  root: string,
  cwd: string,
  instanceId: string,
): string {
  return path.join(projectDir(root, cwd), `${instanceId}.jsonl`);
}

/** The rebuildable bootstrap output for a project. */
export function seedFilePath(root: string, cwd: string): string {
  return path.join(projectDir(root, cwd), "seed.jsonl");
}

/** The one-time legacy/global seed (never GC'd). */
export function globalSeedPath(root: string): string {
  return path.join(root, "history-global.jsonl");
}

/** Advisory hash → cwd map for display labels. */
export function registryPath(root: string): string {
  return path.join(root, "registry.json");
}

// ===========================================================================
// Registry (formerly registry.ts)
// ===========================================================================

export interface RegistryEntryResult {
  hash: string;
  created: boolean;
}

type RegistryData = Record<string, string>;

function readRegistry(root: string): RegistryData {
  try {
    const raw = fs.readFileSync(registryPath(root), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: RegistryData = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeRegistryAtomic(root: string, data: RegistryData): void {
  const target = registryPath(root);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, target);
}

/**
 * Ensure the advisory registry maps this project's hash to its cwd.
 * Idempotent: an existing identical entry writes nothing. A hash mapped to a
 * DIFFERENT cwd is a (practically unreachable) collision — the entry is
 * re-keyed at 24 hash chars so both identities coexist.
 */
export function ensureRegistryEntry(
  root: string,
  cwd: string,
): RegistryEntryResult {
  const hash = projectHash(cwd);
  const data = readRegistry(root);
  if (data[hash] === cwd) return { hash, created: false };
  if (data[hash] !== undefined) {
    // Collision: re-key the EXISTING occupant at 24 hash chars so both
    // identities coexist; the incoming cwd keeps the short hash — the
    // key shape projectDir/sessionFilePath/drains derive.
    const existing = data[hash];
    data[projectHashLong(existing)] = existing;
    data[hash] = cwd;
    writeRegistryAtomic(root, data);
    return { hash, created: true };
  }
  data[hash] = cwd;
  writeRegistryAtomic(root, data);
  return { hash, created: true };
}

function projectHashLong(cwd: string): string {
  // Reuse the same canonicalization as projectHash but keep 24 chars.
  let canonical = cwd;
  try {
    canonical = fs.realpathSync(cwd);
  } catch {
    // fall back to the raw path
  }
  return createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

// ===========================================================================
// Entry primitives (from v1 history-store.ts)
// ===========================================================================

/** One line of `editor-history.jsonl`. */
export interface StoreEntry {
  /** Schema version; 1 when absent in the source line. */
  v: number;
  text: string;
  /** Capture epoch-ms; optional, line order is authoritative for recency. */
  ts?: number;
}

/**
 * Parse one JSONL line. Returns null for malformed lines (bad JSON,
 * non-string or whitespace-only text) so callers can skip them; a torn
 * last line from a crash is handled the same way.
 */
export function parseStoreLine(raw: string): StoreEntry | null {
  if (raw.length === 0) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as { v?: unknown; text?: unknown; ts?: unknown };
    if (typeof record.text !== "string") return null;
    if (record.text.trim().length === 0) return null;
    const entry: StoreEntry = { v: 1, text: record.text };
    if (typeof record.v === "number" && Number.isFinite(record.v)) {
      entry.v = record.v;
    }
    if (typeof record.ts === "number" && Number.isFinite(record.ts)) {
      entry.ts = record.ts;
    }
    return entry;
  } catch {
    return null;
  }
}

// ===========================================================================
// Instance writer (formerly multi-store.ts; scope drains/deletes and GC
// arrive in later slices)
// ===========================================================================

/** Mutable state of ONE pi instance's exclusive capture file. */
export interface SessionWriterState {
  filePath: string;
  /** Logical line count of this instance's file. */
  lineCount: number;
}

/** Command-like prompts (`/name ...`) are UI commands, not prompts. */
function isLikelyCommand(text: string): boolean {
  return /^\/[A-Za-z]/.test(text.trim());
}

function serializeEntry(entry: StoreEntry): string {
  const out: { v: number; text: string; ts?: number } = {
    v: entry.v,
    text: entry.text,
  };
  if (entry.ts !== undefined) out.ts = entry.ts;
  return JSON.stringify(out);
}

/**
 * Open the writer for this pi instance. The file is created LAZILY by the
 * first capture — starting pi must not litter empty files. Only this
 * instance ever appends here (design v2: zero shared writes).
 */
export function openSessionWriter(
  root: string,
  cwd: string,
  instanceId: string,
): SessionWriterState {
  return {
    filePath: sessionFilePath(root, cwd, instanceId),
    lineCount: 0,
  };
}

/**
 * Append one prompt line to the instance's own file (write-through).
 * Skips empty/whitespace-only and command-like prompts.
 */
export function appendSessionCapture(
  state: SessionWriterState,
  text: string,
  ts?: number,
): void {
  if (typeof text !== "string" || text.trim().length === 0) return;
  if (isLikelyCommand(text)) return;

  const entry: StoreEntry = { v: 1, text };
  if (ts !== undefined) entry.ts = ts;
  fs.mkdirSync(path.dirname(state.filePath), { recursive: true });
  fs.appendFileSync(state.filePath, serializeEntry(entry) + "\n", "utf8");
  state.lineCount += 1;
}
