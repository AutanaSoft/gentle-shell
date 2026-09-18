// SPDX-FileCopyrightText: 2026 ExoPro. Inspired by @jasonish/pi-prompt-history
// SPDX-License-Identifier: MIT

// Prompt-history extension entry (slice 1): identity constants, the
// per-instance writer lifecycle, and the before_agent_start capture
// handler. Selector UI, shortcut/command, scope drains, legacy migration
// and seed bootstrap, and GC arrive in later slices.

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
const AGENT_DIR = join(homedir(), ".pi", "agent");
const CURRENT_CWD = process.cwd();
// Instance identity: one exclusive capture file per pi process.
const INSTANCE_ID = randomUUID();

let writerState: SessionWriterState | null = null;

/**
 * One-time init per extension load: register the project in the advisory
 * registry, then open this instance's exclusive capture file. Legacy
 * migration and seed bootstrap join this init order in a later slice.
 */
function getWriter(): SessionWriterState {
  if (!writerState) {
    try {
      ensureRegistryEntry(PI_HISTORY_ROOT, CURRENT_CWD);
    } catch {
      // registry is advisory
    }
    writerState = openSessionWriter(PI_HISTORY_ROOT, CURRENT_CWD, INSTANCE_ID);
  }
  return writerState;
}

export default function promptHistoryExtension(pi: ExtensionAPI) {
  // One writer per extension load; see getWriter() for the init order.

  // Persist every delivered user prompt (write-through, append-only JSONL).
  // The local ExtensionAPI stub types handler args as unknown; narrow here.
  pi.on("before_agent_start", (...args: unknown[]) => {
    try {
      const event = args[0] as { prompt?: string } | undefined;
      appendSessionCapture(getWriter(), event?.prompt ?? "", Date.now());
    } catch {
      // A capture failure must never break the agent loop or unregister
      // the handler - swallow and keep the next prompt capturable.
    }
  });
}
