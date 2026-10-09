import { sanitizeTerminalText } from "./terminal-theme.ts";
import {
	CARD_TONE, cardAwaitingResult, cardBodyRows, cardBottom, cardRunningLine, cardTop,
	floatRows, markCardResult, type CardRowContext, type CardTheme,
} from "./shell-card.ts";

type Operation = "session" | "consult" | "list";
type Result = { content: Array<{ type: string; text?: string }>; details?: unknown };
interface Context extends CardRowContext {
	args?: Record<string, unknown>;
	expanded?: boolean;
	isError?: boolean;
	state?: { orchestratorFailed?: boolean };
}
const clean = (value: unknown): string => typeof value === "string" ? sanitizeTerminalText(value) : "";
const line = (value: unknown): string => clean(value).replace(/\s+/gu, " ").trim();
const text = (result: Result): string => clean(result.content.filter(part => part.type === "text").map(part => part.text ?? "").join("\n"));
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const jsonRows = (value: unknown): string[] => (JSON.stringify(value, (_key, entry) => typeof entry === "string" ? clean(entry) : entry, 2) ?? "null").split("\n");

/** Preserve complete tool data behind expansion without changing the model-facing result. */
export function expandedToolRows(args: unknown, result: Result): string[] {
	return ["", "Arguments:", ...jsonRows(args ?? {}), "", "Result:", ...text(result).split("\n"),
		...(result.details === undefined ? [] : ["", "Result details:", ...jsonRows(result.details)]),
		...result.content.filter(part => part.type !== "text").flatMap(part => jsonRows(part))];
}

function summary(operation: Operation, args: Record<string, unknown>, result: Result, failed: boolean): string[] {
	const body = text(result);
	if (failed) return [line(body) || "Operation failed"];
	const data = record(record(result.details).gentleAgents);
	if (operation === "session" && typeof data.alias === "string") {
		const rows = [`Current alias: ${line(data.alias) || "unnamed"}`];
		if (line(data.alias) && line(args.subject) && line(args.subject) !== line(data.alias)) rows.push("Existing alias preserved; subject does not rename it.");
		return rows;
	}
	if (operation === "consult") {
		const receipt = record(data.receipt);
		if (typeof receipt.status === "string") {
			const code = line(receipt.code) || (Array.isArray(receipt.unknowns) ? line(receipt.unknowns[0]) : "");
			return [`${line(receipt.status)}${code ? ` (${code})` : ""} · not an owner reply; authority none`];
		}
	}
	if (operation === "list") {
		const work = record(data.workSearch);
		if (Array.isArray(work.matches)) return [`${work.matches.length} work matches · non-exhaustive; reachability unknown`];
		if (Array.isArray(data.candidates)) return [`${data.candidates.length} advertised session${data.candidates.length === 1 ? "" : "s"} · reachability unknown`];
	}
	return [line(body.split("\n").find(row => row.trim())) || "No output"];
}

export function orchestratorToolRenderers(operation: Operation, hint: (expanded: boolean) => string) {
	const title = operation === "session" ? "Session identity" : operation === "consult" ? "Consult orchestrator" : "Discover orchestrators";
	return {
		renderShell: "self" as const,
		renderCall(args: Record<string, unknown>, theme: CardTheme, context: Context) {
			return {
				render(width: number) {
					if (width <= 0) return [];
					const pending = cardAwaitingResult(context);
					const tone = context.isError || context.state?.orchestratorFailed ? CARD_TONE.ERROR : CARD_TONE.INFO;
					const subtitle = operation === "session" ? (line(args.subject) ? `Subject: ${line(args.subject)}` : "This session")
						: operation === "consult" ? line(args.kind) || "metadata"
						: Object.hasOwn(args, "filter") ? "Classified work" : args.recipient_session_id ? "Selected session" : "Advertised sessions";
					return floatRows(tone, theme, width, inner => ({
						head: [cardTop({ title, subtitle, body: [], tone, glyph: "🤖" }, theme, inner, hint(!!context.expanded))],
						...(pending ? {
							body: [...(context.expanded ? cardBodyRows(["Arguments:", ...jsonRows(args)], tone, theme, inner, { expanded: true }) : []), cardRunningLine(tone, theme, inner)],
							bottom: cardBottom(tone, theme, inner),
						} : {}),
					}));
				},
				invalidate() {},
			};
		},
		renderResult(result: Result, options: { expanded: boolean; isPartial?: boolean }, theme: CardTheme, context: Context) {
			const failed = !!record(result.details).error || !!context.isError;
			if (!options.isPartial) markCardResult(context.state);
			if (context.state) context.state.orchestratorFailed = failed;
			const tone = failed ? CARD_TONE.ERROR : CARD_TONE.INFO;
			const args = context.args ?? {};
			const body = options.isPartial && !failed ? ["Receiving partial result…"] : summary(operation, args, result, failed);
			if (options.expanded) {
				if (operation === "session") {
					const data = record(record(result.details).gentleAgents);
					if (line(data.senderSessionId)) body.push(`Routing ID: ${line(data.senderSessionId)}`);
					if (line(args.subject)) body.push(`Requested subject: ${line(args.subject)}`);
				}
				body.push(...expandedToolRows(args, result));
			}
			return {
				render(width: number) {
					if (width <= 0) return [];
					return floatRows(tone, theme, width, inner => ({
						afterHeading: true,
						body: cardBodyRows(body, tone, theme, inner, { expanded: options.expanded, previewRows: 3 }),
						bottom: cardBottom(tone, theme, inner),
					}));
				},
				invalidate() {},
			};
		},
	};
}
