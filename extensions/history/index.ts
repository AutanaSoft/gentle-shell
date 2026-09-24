// SPDX-FileCopyrightText: 2026 ExoPro. Inspired by @jasonish/pi-prompt-history
// SPDX-License-Identifier: MIT

// Prompt-history extension entry (slice 1): identity constants, the
// per-instance writer lifecycle, and the before_agent_start capture
// handler. Selector UI, shortcut/command, scope drains, legacy migration
// and seed bootstrap, and GC arrive in later slices.
//
// Capture is OPT-IN while the deletion/privacy behavior is unshipped:
// nothing is recorded unless GENTLE_PI_HISTORY_CAPTURE=1|true|on. With the
// switch off the handler is a no-op — no registry entry, no files, and
// prompts are never written. Unsetting the switch only stops NEW captures;
// files already written stay on disk (docs/prompt-history.md).

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  appendSessionCapture,
  ensureRegistryEntry,
  openSessionWriter,
  type SessionWriterState,
} from "./store.ts";

// v2 multi-concurrency store root (design: tmp/multi-concurrency-design.md).
const PI_HISTORY_ROOT = join(homedir(), ".pi", "agent", "history");

export interface HistoryDeps {
  env?: NodeJS.ProcessEnv;
  root?: string;
  cwd?: string;
  instanceId?: string;
  now?: () => number;
}

/**
 * Strict opt-in: capture stays off unless GENTLE_PI_HISTORY_CAPTURE is
 * explicitly 1, true, or on (case-insensitive). The same switch is the
 * disable path — unsetting it stops new captures; files already on disk
 * are left untouched until the deletion tooling lands.
 */
export function captureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.GENTLE_PI_HISTORY_CAPTURE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

export default function promptHistoryExtension(
  pi: ExtensionAPI,
  deps: HistoryDeps = {},
): void {
  const env = deps.env ?? process.env;
  const root = deps.root ?? PI_HISTORY_ROOT;
  const cwd = deps.cwd ?? process.cwd();
  const instanceId = deps.instanceId ?? randomUUID();
  const now = deps.now ?? Date.now;
  let writerState: SessionWriterState | null = null;

  /**
   * One-time init per extension load: register the project in the advisory
   * registry, then open this instance's exclusive capture file. Legacy
   * migration and seed bootstrap join this init order in a later slice.
   */
  const getWriter = (): SessionWriterState => {
    if (!writerState) {
      try {
        ensureRegistryEntry(root, cwd);
      } catch {
        // registry is advisory
      }
      writerState = openSessionWriter(root, cwd, instanceId);
    }
    return writerState;
  };

  // Persist every delivered user prompt (write-through, append-only JSONL),
  // but only for opted-in sessions — see captureEnabled(). The local
  // ExtensionAPI stub types handler args as unknown; narrow here.
  pi.on("before_agent_start", (...args: unknown[]) => {
    if (!captureEnabled(env)) return;
    try {
      const event = args[0] as { prompt?: string } | undefined;
      appendSessionCapture(getWriter(), event?.prompt ?? "", now());
    } catch {
      // A capture failure must never break the agent loop or unregister
      // the handler - swallow and keep the next prompt capturable.
    }
  });
}
