// Deterministic ODD phase inference from observed tool activity. The Gentle
// Shell working label used to depend only on the model calling
// gentle_odd_phase, which models routinely skip; the tools the primary
// session actually runs are a reliable, observable signal instead.
//
// The mapping is deliberately conservative: an unknown tool, a subagent
// tool, or an ambiguous shell command returns undefined so the caller leaves
// the current label unchanged. This module is pure (no Pi or registry
// imports); precedence against explicit reports lives in OddPhaseRegistry.

import type { OddPhase } from "./odd-phase.ts";

const TOOL_PHASES: Readonly<Record<string, OddPhase>> = {
	read: "exploring",
	grep: "exploring",
	find: "exploring",
	ls: "exploring",
	codegraph: "exploring",
	ask_user_choice: "deciding",
	ask_user_question: "deciding",
	todo: "planning",
	gentle_review: "checking",
	gentle_review_scope: "checking",
	gentle_review_capture: "checking",
	gentle_review_capture_group: "checking",
};

const WRITE_TOOLS = new Set(["edit", "write"]);
const SHELL_TOOLS = new Set(["bash", "powershell"]);

// Test, typecheck, lint, and build runners. Matched per shell segment.
const CHECKING_COMMANDS: readonly RegExp[] = [
	/^(pnpm|npm|yarn|bun)\s+(run\s+)?(test|typecheck|lint|build|check)\b/,
	/^node\b.*\s--test\b/,
	/^node\s+\S*(test|check|lint|typecheck)[\w-]*\.m?[jt]s\b/,
	/^((npx|pnpx|bunx)\s+|(pnpm|yarn)\s+exec\s+)?(vitest|jest|mocha|tsc|eslint|pytest)\b/,
	/^python3?\s+-m\s+pytest\b/,
	/^go\s+(test|build|vet)\b/,
	/^cargo\s+(test|build|check|clippy)\b/,
	/^make\b/,
];

// Read-only inspection. Matched per shell segment.
const EXPLORING_COMMANDS: readonly RegExp[] = [
	/^git\s+(status|log|diff|show|blame|rev-parse)\b/,
	/^git\s+branch(\s+(-a|-r|-v|-vv|--all|--remotes|--list|--show-current))*$/,
	/^(ls|cat|head|tail|grep|rg|wc|pwd|tree|stat)\b/,
	/^find\b(?!.*\s-(delete|exec|execdir|ok)\b)/,
];

// Segments that neither inspect nor change anything worth labeling.
const NEUTRAL_COMMANDS: readonly RegExp[] = [/^cd\b/];

/**
 * Infers the ODD phase implied by a tool call, or undefined when the call
 * carries no reliable phase signal and the label must stay as it is.
 */
export function inferOddPhase(toolName: string, args: unknown): OddPhase | undefined {
	const name = normalizeToolName(toolName);
	if (WRITE_TOOLS.has(name)) return isOddTaskPath(stringArg(args, "path") ?? stringArg(args, "file_path")) ? "planning" : "implementing";
	if (SHELL_TOOLS.has(name)) return inferShellPhase(stringArg(args, "command"));
	return Object.hasOwn(TOOL_PHASES, name) ? TOOL_PHASES[name] : undefined;
}

// Some runtimes expose tools through an MCP proxy as `mcp__<server>__<tool>`.
function normalizeToolName(toolName: string): string {
	return toolName.replace(/^mcp__.+?__/, "");
}

function stringArg(args: unknown, key: string): string | undefined {
	if (typeof args !== "object" || args === null) return undefined;
	const value = (args as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
}

function isOddTaskPath(path: string | undefined): boolean {
	return path !== undefined && /(^|\/)odd\/tasks\//.test(path.replaceAll("\\", "/"));
}

/**
 * A command checks when any segment runs a checker; it explores only when
 * every segment is read-only inspection (or neutral like `cd`). Anything
 * else — a mutation, an install, an unknown program — is ambiguous.
 */
function inferShellPhase(command: string | undefined): OddPhase | undefined {
	if (command === undefined) return undefined;
	const segments = command.split(/&&|\|\||[;|\n]/)
		.map(stripSegment)
		.filter((segment) => segment.length > 0 && !matchesAny(NEUTRAL_COMMANDS, segment));
	if (segments.length === 0) return undefined;
	if (segments.some((segment) => matchesAny(CHECKING_COMMANDS, segment))) return "checking";
	return segments.every(isReadOnlyInspection) ? "exploring" : undefined;
}

// Drops leading environment assignments (`CI=1 pnpm test`) and whitespace.
function stripSegment(segment: string): string {
	return segment.trim().replace(/^([A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
}

// Output redirection to a file is a write, not inspection; stream merges
// and /dev/null are not.
function isReadOnlyInspection(segment: string): boolean {
	const withoutHarmlessRedirects = segment.replace(/\d?>&\d/g, "").replace(/\d?>\s*\/dev\/null/g, "");
	return !withoutHarmlessRedirects.includes(">") && matchesAny(EXPLORING_COMMANDS, segment);
}

function matchesAny(patterns: readonly RegExp[], segment: string): boolean {
	return patterns.some((pattern) => pattern.test(segment));
}
