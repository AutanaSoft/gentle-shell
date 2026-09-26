export interface PromptRecord {
  text: string;
  searchText: string;
  /**
   * Provenance (spec C3): set on records built from PromptEntry inputs;
   * ABSENT on records built from bare strings so the pinned deepEqual
   * record shape ({text, searchText}) stays byte-compatible (design §I).
   */
  source?: PromptSource;
  /** Session records only: the resolved ms-epoch ordering timestamp. */
  ts?: number;
}

/** Provenance of a prompt record or merge-loader entry (spec C3). */
export type PromptSource = "editor" | "session";

/**
 * Merge-loader currency (pre-dedup, spec C3): one editor-store or
 * session-derived prompt. Session entries carry the resolved ms-epoch `ts`;
 * editor entries do not (block ordering at the seam, proposal R8).
 */
export interface PromptEntry {
  text: string;
  source: PromptSource;
  ts?: number;
}

/** Half-open window of list rows currently rendered (spec: centered cursor). */
export interface VisibleRange {
  start: number;
  end: number;
}

/** One rendered list row: the record, its master index, and cursor state. */
export interface VisiblePromptRecord {
  index: number;
  record: PromptRecord;
  isSelected: boolean;
}

export function buildPromptRecords(
  entries: ReadonlyArray<string | PromptEntry>,
): PromptRecord[] {
  return entries.map((entry): PromptRecord => {
    if (typeof entry === "string") {
      // Bare string input keeps the EXACT Change 2 runtime shape — the
      // pinned deepEqual records carry only {text, searchText}.
      return { text: entry, searchText: entry.toLowerCase() };
    }
    const record: PromptRecord = {
      text: entry.text,
      searchText: entry.text.toLowerCase(),
      source: entry.source,
    };
    if (entry.ts !== undefined) {
      record.ts = entry.ts;
    }
    return record;
  });
}

/**
 * Normalization key for read-time dedup (spec C3): byte-matches the
 * APPLIED patch key in nav/patches/editor.cjs (:480-:586) — whitespace
 * runs collapse, then trim, then a 120-char prefix slice, then lowercase.
 * The literal is the single-backslash applied-patch form; the raw patch
 * file stores \\s+ only because its code sits inside a template literal.
 * Shared by contract (spec C4): hide-prompts tombstone keys and the
 * merge-history session-half tombstone filter MUST byte-match this key.
 */
export function promptDedupKey(entry: string): string {
  return entry.replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase();
}

/**
 * Read-time dedup pass (spec C3): keep-first over input order (file order
 * is newest-first, mirroring the patch's keep-first dedup-on-save), and
 * empty-key entries (empty or whitespace-only) are skipped — excluded from
 * the output and never usable as collision keys. Removes ONLY duplicate-
 * normalized entries; no snapshot cap (filterPrompts still caps output).
 * Generic over string | PromptEntry (WU3): over the COMBINED merged input
 * the keep-first rule makes the editor copy win at the seam — objects pass
 * through with provenance intact; no new dedup logic exists anywhere.
 */
export function dedupePromptEntries<T extends string | PromptEntry>(
  entries: readonly T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const entry of entries) {
    const key =
      typeof entry === "string"
        ? promptDedupKey(entry)
        : promptDedupKey(entry.text);
    if (key !== "" && !seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Selector navigation & windowing (open-flow surface; search/paging helpers
// join in later stages)
// ---------------------------------------------------------------------------

/** Wrapped cursor move: (+/-delta) with modulo wrap over the total. */
export function moveSelectedIndex(
  selectedIndex: number,
  total: number,
  delta: number,
): number {
  if (total === 0) return 0;
  return (selectedIndex + delta + total) % total;
}

/**
 * Centered visible window (a22588fc shape): keep the cursor near the middle
 * once the list outgrows maxVisible; small lists render in full.
 */
export function computeVisibleRange(
  selectedIndex: number,
  total: number,
  maxVisible: number,
): VisibleRange {
  if (total <= 0 || maxVisible <= 0) return { start: 0, end: 0 };
  if (total <= maxVisible) return { start: 0, end: total };

  const half = Math.floor(maxVisible / 2);
  const start = Math.max(0, Math.min(selectedIndex - half, total - maxVisible));

  return {
    start,
    end: Math.min(start + maxVisible, total),
  };
}

/** The rows to render for the current cursor: sliced, indexed, cursor-flagged. */
export function getVisiblePromptRecords(
  records: PromptRecord[],
  selectedIndex: number,
  maxVisible: number,
): VisiblePromptRecord[] {
  const { start, end } = computeVisibleRange(
    selectedIndex,
    records.length,
    maxVisible,
  );
  return records.slice(start, end).map((record, offset) => ({
    index: start + offset,
    record,
    isSelected: start + offset === selectedIndex,
  }));
}

const MAX_RESULTS = 10000;

export function filterPrompts(
  records: PromptRecord[],
  query: string,
): PromptRecord[] {
  const trimmed = query.trim();
  if (!trimmed) return records.slice(0, MAX_RESULTS);

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = records.filter((record) => {
    return tokens.every((token) => record.searchText.includes(token));
  });

  return filtered.slice(0, MAX_RESULTS);
}
