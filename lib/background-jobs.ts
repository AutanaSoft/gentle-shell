// Background jobs: pure condition core.
//
// A background job runs a shell command while the parent keeps working or
// stays idle. The parent is woken once when the job exits, and at most once
// more per optional condition: the first complete output line matching a
// pattern, or a stretch of silence. The watch below decides those conditions
// from output chunks and clock values only; it owns no timers, processes, or
// I/O, so every boundary is unit-testable against a fake clock.

/** Lines kept for the exit notice and job listings. */
export const TAIL_LINES = 20;

export interface JobConditions {
	/** Wake once on the first complete output line matching this pattern. */
	match?: RegExp;
	/** Wake once after this many milliseconds without output. */
	silenceMs?: number;
}

export type JobEvent = { kind: "match"; line: string } | { kind: "silence"; silentMs: number };

export interface JobWatch {
	/** Feeds output; returns the conditions that fired on this chunk. */
	push(text: string, now: number): JobEvent[];
	/** Ends the output: a trailing partial line counts as complete. */
	end(): JobEvent[];
	/** Clock value at which silence fires, or undefined when it cannot. */
	silenceDeadline(): number | undefined;
	checkSilence(now: number): JobEvent[];
	/** The last TAIL_LINES complete lines. */
	tail(): string[];
}

export function createJobWatch(conditions: JobConditions, startedAt: number): JobWatch {
	let partial = "";
	let lastOutputAt = startedAt;
	let matched = conditions.match === undefined;
	let silenced = conditions.silenceMs === undefined || conditions.silenceMs <= 0;
	let ended = false;
	const lines: string[] = [];

	const takeLine = (raw: string, events: JobEvent[]) => {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		lines.push(line);
		if (lines.length > TAIL_LINES) lines.shift();
		if (!matched && conditions.match!.test(line)) {
			matched = true;
			events.push({ kind: "match", line });
		}
	};

	return {
		push(text, now) {
			const events: JobEvent[] = [];
			if (ended || text.length === 0) return events;
			lastOutputAt = now;
			const parts = (partial + text).split("\n");
			partial = parts.pop() ?? "";
			for (const part of parts) takeLine(part, events);
			return events;
		},
		end() {
			const events: JobEvent[] = [];
			if (ended) return events;
			ended = true;
			silenced = true;
			if (partial.length > 0) takeLine(partial, events);
			partial = "";
			return events;
		},
		silenceDeadline() {
			return silenced ? undefined : lastOutputAt + conditions.silenceMs!;
		},
		checkSilence(now) {
			if (silenced || now - lastOutputAt < conditions.silenceMs!) return [];
			silenced = true;
			return [{ kind: "silence", silentMs: now - lastOutputAt }];
		},
		tail() {
			return [...lines];
		},
	};
}

/**
 * Compiles a model-supplied pattern. The g and y flags make `test` stateful
 * across calls (lastIndex), which would skip matches, so they are dropped.
 */
export function compileJobMatch(pattern: string, flags: string | undefined): RegExp {
	try {
		return new RegExp(pattern, (flags ?? "").replace(/[gy]/g, ""));
	} catch (error) {
		throw new Error(`Invalid match pattern: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** Keeps only lines matching `filter`; without one, returns the text unchanged. */
export function filterOutputLines(text: string, filter: RegExp | undefined): string {
	if (!filter) return text;
	return text.split("\n").filter((line) => line.length > 0 && filter.test(line)).map((line) => `${line}\n`).join("");
}
