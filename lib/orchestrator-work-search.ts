import { isAbsolute } from "node:path";
import type { PresenceRecord } from "./agents-session-transport.ts";
import { discoverOrchestrators, type OrchestratorCandidate } from "./orchestrator-discovery.ts";
import { decodeWorkDescriptor, type WorkDescriptor, type WorkRef } from "./orchestrator-work.ts";
import type { RepositoryFact } from "./orchestrator-scope.ts";

export interface WorkFilter {
	area?: string;
	topic?: string;
	tag?: string;
	text?: string;
	ref?: WorkRef;
	repository_root?: string;
}
const safeText = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim()
	&& Buffer.byteLength(v) <= max && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
const fold = (s: string) => s.normalize("NFC").trim().toLowerCase();

/** Validate before discovery; preserve public spelling and exact reference identity. */
export function validateWorkFilter(value: unknown): WorkFilter {
	const invalid = () => { throw new Error("invalid-work-filter"); };
	if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
	const input = value as Record<string, unknown>;
	if (Object.keys(input).some(k => !["area", "topic", "tag", "text", "ref", "repository_root"].includes(k))) return invalid();
	const result: WorkFilter = {};
	for (const key of ["area", "topic", "tag", "text", "repository_root"] as const) {
		if (!Object.hasOwn(input, key)) continue;
		const v = input[key];
		if (!safeText(v, key === "text" ? 1024 : key === "repository_root" ? 256 : 64)) return invalid();
		if (key === "repository_root" && (!isAbsolute(v) || /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/u.test(v))) return invalid();
		result[key] = v;
	}
	if (result.topic && !result.area) return invalid();
	if (Object.hasOwn(input, "ref")) {
		try { result.ref = decodeWorkDescriptor({ refs: [input.ref] }).refs![0]; }
		catch { return invalid(); }
	}
	return result;
}

interface WorkNode {
	sessionId: string;
	taskId?: string;
	label?: string;
	workspace?: string | null;
	status?: string;
	repository?: RepositoryFact;
	work: WorkDescriptor;
	recordedAt: number;
}
export interface WorkSearchResult {
	schema: 1;
	ownerReply: false;
	authority: "none";
	reachability: "unknown";
	observedAt: number;
	coverage: {
		exhaustive: false;
		examinedPeers: number;
		unexaminedPeers: number;
		unknownContext: number;
		unclassified: number;
		unmatchedTaskAnnotations: number;
		catalogUnknown: number;
		catalogOmittedTasks: number;
		pendingCatalogPages: number;
		omittedMatches: number;
	};
	matches: (WorkNode & { reasons: string[] })[];
}

/** Only current catalog IDs are task identities; annotations never imply liveness. */
function collectNodes(candidate: OrchestratorCandidate, coverage: WorkSearchResult["coverage"]): WorkNode[] {
	const record = candidate.workRecord;
	if (!record) coverage.unknownContext++;
	if (!candidate.catalog) coverage.catalogUnknown++;
	else {
		coverage.catalogOmittedTasks += candidate.catalog.omittedTasks;
		if (candidate.catalog.cursor) coverage.pendingCatalogPages++;
	}
	const nodes: WorkNode[] = [];
	const { tasks: annotations = {}, ...root } = record?.work ?? {};
	const classified = (work: WorkDescriptor) => !!(work.area || work.tags?.length || work.refs?.length);
	const base = { sessionId: candidate.sessionId, recordedAt: record?.recordedAt ?? 0 };
	if (record && classified(root)) nodes.push({ ...base, label: candidate.label, workspace: candidate.workspace,
		repository: candidate.scope?.host, work: root });
	else if (record) coverage.unclassified++;
	const live = candidate.catalog?.tasks ?? [];
	coverage.unmatchedTaskAnnotations += Object.keys(annotations).filter(id => !live.some(t => t.id === id)).length;
	for (const task of live) {
		const work = Object.hasOwn(annotations, task.id) ? annotations[task.id] : undefined;
		if (!work) {
			if (record) coverage.unclassified++;
			continue;
		}
		nodes.push({ ...base, taskId: task.id, label: task.label, workspace: task.cwd, status: task.status,
			repository: candidate.scope?.tasks.find(t => t.id === task.id)?.repository, work });
	}
	return nodes;
}

function matchReasons(node: WorkNode, filter: WorkFilter): string[] | undefined {
	const reasons: string[] = [];
	const check = (present: boolean, matches: boolean, reason: string) => {
		if (!present) return true;
		if (!matches) return false;
		reasons.push(reason);
		return true;
	};
	const work = node.work;
	if (!check(filter.area !== undefined, !!work.area && fold(work.area) === fold(filter.area ?? ""), "area")) return;
	if (!check(filter.topic !== undefined, !!work.topic && fold(work.topic) === fold(filter.topic ?? ""), "topic")) return;
	if (!check(filter.tag !== undefined, !!work.tags?.some(t => fold(t) === fold(filter.tag ?? "")), "tag")) return;
	const text = [node.label, work.area, work.topic, ...(work.tags ?? []),
		...(work.refs ?? []).flatMap(r => [r.kind, r.repository, r.id])].filter((s): s is string => s !== undefined);
	if (!check(filter.text !== undefined, text.some(s => fold(s).includes(fold(filter.text ?? ""))), "text")) return;
	const ref = filter.ref;
	if (!check(!!ref, !!work.refs?.some(r => r.kind === ref?.kind && r.repository === ref.repository && r.id === ref.id), "ref")) return;
	if (!check(filter.repository_root !== undefined, node.repository?.root === filter.repository_root, "repository_root")) return;
	return reasons.length ? reasons : ["classified"];
}

/** Detached bounded index, not an owner reply, live probe, or exhaustive search. */
export function searchPublishedWork(profile: string, peers: readonly PresenceRecord[], filter: unknown = {},
	selection?: { recipientSessionId?: string; cursor?: string }, now = Date.now()): WorkSearchResult {
	const validated = validateWorkFilter(filter);
	if (selection !== undefined) {
		if (!selection || typeof selection !== "object" || Array.isArray(selection)
			|| Object.keys(selection).some(k => !["recipientSessionId", "cursor"].includes(k))
			|| (selection.recipientSessionId !== undefined && !safeText(selection.recipientSessionId, 256))
			|| (selection.cursor !== undefined && (typeof selection.cursor !== "string" || selection.cursor.length > 1024)))
			throw new Error("invalid-work-selection");
	}
	if (selection?.cursor !== undefined && selection.recipientSessionId === undefined) throw new Error("work-cursor-requires-recipient");
	const ids = [...new Set(peers.map(p => p.sessionId))].sort();
	const eligible = selection?.recipientSessionId !== undefined ? ids.filter(id => id === selection.recipientSessionId) : ids;
	const selected = new Set(eligible.slice(0, 64));
	const result: WorkSearchResult = { schema: 1, ownerReply: false, authority: "none", reachability: "unknown", observedAt: now,
		coverage: { exhaustive: false, examinedPeers: selected.size, unexaminedPeers: ids.length - selected.size,
			unknownContext: 0, unclassified: 0, unmatchedTaskAnnotations: 0, catalogUnknown: 0,
			catalogOmittedTasks: 0, pendingCatalogPages: 0, omittedMatches: 0 }, matches: [] };
	// Retain duplicate activations so discovery can refuse ambiguous joins.
	const candidates = discoverOrchestrators(profile, peers.filter(p => selected.has(p.sessionId)), now,
		{ ...selection, includeWork: true }).sort((a, b) => a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0);
	const matches = candidates.flatMap(c => collectNodes(c, result.coverage))
		.map(node => ({ node, reasons: matchReasons(node, validated) })).filter(m => m.reasons !== undefined);
	result.coverage.omittedMatches = matches.length;
	for (const { node, reasons } of matches) {
		result.matches.push({ ...node, reasons: reasons! });
		result.coverage.omittedMatches--;
		if (Buffer.byteLength(JSON.stringify(result)) > 16 * 1024) {
			result.matches.pop();
			result.coverage.omittedMatches++;
		}
	}
	return structuredClone(result);
}
