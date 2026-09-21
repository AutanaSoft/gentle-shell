import {
	NATIVE_REVIEW_MODE_OPERATION,
	NATIVE_REVIEW_MODE_SOURCE,
	type NativeReviewCli,
	type NativeReviewModeStatus,
} from "./native-review-cli.ts";

export const RDD_STATUS_TIMEOUT_MS = 3_000;
export const RDD_STATUS_MEMO_TTL_MS = 30_000;

export type RddMode = "on" | "off" | "unknown";

export interface RddModeStatus {
	readonly mode: RddMode;
	readonly projectOverride: boolean;
	/** Retained for consumers that need the native-authoritative detailed source. */
	readonly status?: NativeReviewModeStatus;
}

interface MemoEntry {
	readonly value: RddModeStatus;
	readonly expiresAt: number;
	readonly globalGeneration: number;
	readonly cwdGeneration: number;
}

const memo = new Map<string, MemoEntry>();
const cwdGenerations = new Map<string, number>();
let globalGeneration = 0;

export function isValidRddModeStatus(status: unknown): status is NativeReviewModeStatus {
	if (status === undefined || status === null || typeof status !== "object") return false;
	const candidate = status as Partial<NativeReviewModeStatus>;
	if (typeof candidate.global !== "string" || typeof candidate.cloneLocal !== "string") return false;
	if (candidate.effective !== "on" && candidate.effective !== "off") return false;
	return typeof candidate.source === "string" && Object.values(NATIVE_REVIEW_MODE_SOURCE).includes(candidate.source as never);
}

function unknown(): RddModeStatus {
	return { mode: "unknown", projectOverride: false };
}

function project(status: NativeReviewModeStatus | undefined): RddModeStatus {
	if (!isValidRddModeStatus(status)) return unknown();
	return {
		mode: status.effective,
		projectOverride: status.source === NATIVE_REVIEW_MODE_SOURCE.CLONE_LOCAL,
		status,
	};
}

function abortRejection(signal: AbortSignal): Promise<never> {
	return new Promise((_resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason ?? new Error("aborted"));
			return;
		}
		signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
	});
}

/**
 * Reads native review-mode STATUS as the sole authority and projects it into
 * UI-safe state. Successful and failed observations are memoized per cwd.
 */
export async function readRddModeStatus(
	nativeReviewCli: Pick<NativeReviewCli, "reviewMode"> | null | undefined,
	cwd: string,
	callerSignal?: AbortSignal,
	now: () => number = Date.now,
): Promise<RddModeStatus> {
	if (callerSignal?.aborted) return unknown();
	const nowMs = now();
	const cached = memo.get(cwd);
	if (cached !== undefined && cached.expiresAt > nowMs) return cached.value;

	const startGlobalGeneration = globalGeneration;
	const startCwdGeneration = cwdGenerations.get(cwd) ?? 0;
	const timeout = AbortSignal.timeout(RDD_STATUS_TIMEOUT_MS);
	const signal = callerSignal === undefined ? timeout : AbortSignal.any([callerSignal, timeout]);
	let value = unknown();
	if (nativeReviewCli?.reviewMode !== undefined) {
		try {
			const call = nativeReviewCli.reviewMode({ cwd, operation: NATIVE_REVIEW_MODE_OPERATION.STATUS, signal });
			const result = await Promise.race([call, abortRejection(signal)]);
			if (result.operation === NATIVE_REVIEW_MODE_OPERATION.STATUS) value = project(result.status);
		} catch {
			value = unknown();
		}
	}

	// A cancelled caller must not poison the shared observation. Likewise, an
	// invalidated request belongs to an older generation and cannot revive it.
	if (!callerSignal?.aborted
		&& startGlobalGeneration === globalGeneration
		&& startCwdGeneration === (cwdGenerations.get(cwd) ?? 0)) {
		memo.set(cwd, {
			value,
			expiresAt: nowMs + RDD_STATUS_MEMO_TTL_MS,
			globalGeneration: startGlobalGeneration,
			cwdGeneration: startCwdGeneration,
		});
	}
	return value;
}

/** Clears one cwd observation, or all observations when cwd is omitted. */
export function invalidateRddModeStatus(cwd?: string): void {
	if (cwd === undefined) {
		globalGeneration += 1;
		memo.clear();
		return;
	}
	cwdGenerations.set(cwd, (cwdGenerations.get(cwd) ?? 0) + 1);
	memo.delete(cwd);
}

/** @internal test seam. */
export function clearRddStatusMemoForTesting(cwd?: string): void {
	invalidateRddModeStatus(cwd);
}
