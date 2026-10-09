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
const hiddenFields = new Set(["schema", "digest", "publication"]);
const fieldLabels: Record<string, string> = {
	sessionId: "Session ID", senderSessionId: "Sender session", recipientSessionId: "Recipient session",
	targetSessionId: "Target session", id: "ID", cwd: "Workspace",
};
function label(key: string): string {
	const named = Object.hasOwn(fieldLabels, key) ? fieldLabels[key]
		: line(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim().toLowerCase().replace(/^./u, char => char.toUpperCase());
	return named.replace(/\bid\b/gi, "ID");
}
const section = (title: string, rows: string[]): string[] => rows.length ? ["", `${title}:`, ...rows] : [];

/** Format plain tool data as labelled rows, never as JSON or executable terminal text. */
export function readableDataRows(value: unknown, indent = ""): string[] {
	const fields = record(value);
	const unknownRepository = Object.hasOwn(fields, "root") && Object.hasOwn(fields, "cloneHash")
		&& (fields.root === null || fields.cloneHash === null);
	return [...(unknownRepository ? [`${indent}Repository identity: unknown`] : []), ...Object.entries(fields).flatMap(([key, entry]) => {
		if (hiddenFields.has(key) || entry === undefined || entry === null) return [];
		const heading = `${indent}${label(key)}:`;
		if (key === "cursor") return [`${indent}Continuation token: provided`];
		if (Array.isArray(entry)) {
			const rows = entry.flatMap((item, index) => {
				if (item !== null && typeof item === "object") {
					const { label: itemLabel, ...fields } = record(item);
					return [`${indent}  ${index + 1}.${line(itemLabel) ? ` ${line(itemLabel)}` : ""}`, ...readableDataRows(fields, `${indent}    `)];
				}
				return item === null ? [] : [`${indent}  • ${line(String(item))}`];
			});
			return rows.length ? [heading, ...rows] : [];
		}
		if (typeof entry === "object") {
			const rows = readableDataRows(entry, `${indent}  `);
			return rows.length ? [heading, ...rows] : [];
		}
		const shown = typeof entry === "boolean" ? entry ? "yes" : "no" : clean(String(entry));
		return shown ? [`${heading} ${shown}`] : [];
	})];
}

function parsedOutput(result: Result): unknown {
	const body = text(result);
	try { return JSON.parse(body); } catch { return body; }
}

function requestRows(args: unknown): string[] {
	const input = record(args);
	return readableDataRows(input.state === null ? { ...input, state: "withdrawn" } : input);
}

/** Prefer structured data over its duplicated model-facing serialization. */
export function expandedToolRows(args: unknown, result: Result): string[] {
	const data = record(record(result.details).gentleAgents);
	const output = Object.keys(data).length ? data : parsedOutput(result);
	return [...section("Request", requestRows(args)), ...section("Details", typeof output === "string" ? output.split("\n") : readableDataRows(output)),
		...result.content.filter(part => part.type !== "text").map(part => `Attachment: ${line(part.type)}`)];
}

function discoveredSessionRows(candidates: unknown[]): string[] {
	const missing = candidates.filter(candidate => record(candidate).freshness !== "recent").length;
	return [...(missing ? [`Metadata unavailable for ${missing} session${missing === 1 ? "" : "s"}; no current context inferred.`, ""] : []),
		...candidates.flatMap((candidate, index) => {
			const peer = record(candidate);
			const { sessionId, label: peerLabel, reachability, freshness, ...context } = peer;
			const recent = freshness === "recent";
			return [`${index + 1}. ${recent && line(peerLabel) ? line(peerLabel) : "Session"}`,
				`  Session ID: ${line(sessionId)}`, ...(recent ? [
					...(!Object.keys(record(context.scope)).length ? ["  Repository scope: unknown"] : []),
					...readableDataRows(context, "  "),
				] : []), ""];
		})];
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
		const receipt = record(data.receipt ?? parsedOutput(result));
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
	const parsed = parsedOutput(result);
	return [typeof parsed === "string" ? line(body.split("\n").find(row => row.trim())) || "No output" : readableDataRows(parsed)[0] || "No output"];
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
							body: [...(context.expanded ? cardBodyRows(requestRows(args), tone, theme, inner, { expanded: true }) : []), cardRunningLine(tone, theme, inner)],
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
				const data = record(record(result.details).gentleAgents);
				if (operation === "session" && typeof data.alias === "string" && !failed) {
					if (line(data.senderSessionId)) body.push(`Routing ID: ${line(data.senderSessionId)}`);
					if (line(args.subject)) body.push(`Requested subject: ${line(args.subject)}`);
					body.push(...(args.state === null ? ["Published state: withdrawn"] : section("Published state", readableDataRows(args.state))));
				} else if (operation === "list" && Array.isArray(data.candidates) && !failed) {
					body.push("Recorded context only; no reachability or ownership guarantee.", ...section("Request", requestRows(args)), ...section("Sessions", discoveredSessionRows(data.candidates)));
				} else if (operation === "consult" && data.receipt !== undefined && !failed) {
					body.push(...section("Request", requestRows(args)), ...section("Published context / advice", readableDataRows(data.receipt)));
				} else if (!Object.keys(data).length && typeof parsedOutput(result) === "string") {
					body.splice(0, body.length, ...section("Request", requestRows(args)), ...text(result).split("\n"));
				} else {
					body.push(...expandedToolRows(args, result));
				}
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
