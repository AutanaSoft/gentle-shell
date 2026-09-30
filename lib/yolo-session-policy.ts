import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendSystemPromptOnce, type AppendableSystemPromptOptions } from "./append-system-prompt.ts";
import { captureReviewSessionIdentity, sameReviewSessionIdentity, type ReviewSessionIdentity } from "./review-session-standing-permission.ts";

export const YOLO_STATUS_KEY = "gentle:yolo";
export const YOLO_STATUS_TEXT = "YOLO ON — destructive confirmations remain";
export const YOLO_DIRECTIVE = `<gentle-yolo-session>
YOLO session standing permission is ON, explicitly activated by the human for this live primary session and Git clone.
Qualify the default commit, push and PR confirmation clauses: for ordinary already-scoped implementation, checks, commits, non-force pushes and PR creation, this activation supplies standing permission instead of repeated permission questions. Make ordinary reversible implementation choices without needless interviews.
This does NOT override explicit human restrictions, repository policy, project trust, configured confirmations or blocks, or the authorized task scope. Ask before scope expansion, privacy-sensitive disclosure, genuinely unresolved consequential product choices, or ambiguous destinations or credentials. Never invent destinations or credentials.
Destructive/data-loss confirmations remain mandatory and independent. Never auto-answer ask_user tools, provider consent, maintenance/recovery authorization or opaque-token decisions. Review standing permission and RDD are unchanged. Children remain bounded by their delegated task; they receive no independent delivery grant or YOLO inheritance.
</gentle-yolo-session>`;

/** Separate from review grants; no registry, entries, configuration or environment enable switch. */
export class YoloSessionPolicy {
	private grant: ReviewSessionIdentity | undefined;
	private generation = 0;

	get epoch(): number { return this.generation; }
	get enabled(): boolean { return this.grant !== undefined; }

	reset(): void {
		this.generation += 1;
		this.grant = undefined;
	}

	set(enabled: boolean, identity: ReviewSessionIdentity | undefined, expectedEpoch = this.epoch): boolean {
		if (expectedEpoch !== this.epoch) return false;
		this.reset();
		if (!enabled) return true;
		if (identity === undefined) return false;
		this.grant = identity;
		return true;
	}

	active(identity: ReviewSessionIdentity | undefined): boolean {
		if (!this.grant) return false;
		if (identity !== undefined && sameReviewSessionIdentity(this.grant, identity)) return true;
		this.reset();
		return false;
	}
}

/** Remove our exact block as well as adding it: bridge options can be reused. */
export function updateYoloPrompt(options: AppendableSystemPromptOptions | null | undefined, active: boolean): void {
	if (!options) return;
	options.appendSystemPrompt = (options.appendSystemPrompt ?? "")
		.replace(`\n\n${YOLO_DIRECTIVE}`, "").replace(YOLO_DIRECTIVE, "");
	if (active) appendSystemPromptOnce(options, YOLO_DIRECTIVE);
}

export interface YoloSessionController {
	active(context: ExtensionContext): Promise<boolean>;
	reset(context: ExtensionContext): void;
}

/** Register only a human slash command, never a tool, flag or persisted setting. */
export function registerYoloSessionPolicy(pi: ExtensionAPI, env: NodeJS.ProcessEnv): YoloSessionController {
	const policy = new YoloSessionPolicy();
	const publish = (context: ExtensionContext, active: boolean): void => {
		// Display is not authority. Widgets survive shells that hide the status rail.
		try { context.ui.setStatus(YOLO_STATUS_KEY, active ? YOLO_STATUS_TEXT : undefined); } catch { /* nonblocking */ }
		try { context.ui.setWidget(YOLO_STATUS_KEY, active ? [YOLO_STATUS_TEXT] : undefined); } catch { /* nonblocking */ }
	};
	const capture = async (context: ExtensionContext): Promise<ReviewSessionIdentity | undefined> => {
		const cwd = context.cwd;
		const identity = await captureReviewSessionIdentity(context, env);
		// Git lookup awaits: a replacement manager ID must not activate stale scope.
		try { return cwd === context.cwd && identity?.sessionId === context.sessionManager.getSessionId() ? identity : undefined; }
		catch { return undefined; }
	};
	const active = async (context: ExtensionContext): Promise<boolean> => {
		const epoch = policy.epoch;
		const identity = policy.enabled ? await capture(context) : undefined;
		if (epoch !== policy.epoch) return false;
		const enabled = policy.active(identity);
		publish(context, enabled);
		return enabled;
	};
	// The owning extension calls this from its existing lifecycle hooks, including
	// reload. Keep their cardinality and ordering intact for SDK and legacy hosts.
	const reset = (context: ExtensionContext): void => {
		policy.reset();
		publish(context, false);
	};
	pi.registerCommand("yolo", {
		description: "Session-only ordinary development/delivery permission (on|off|status; empty toggles). Destructive confirmations remain.",
		handler: async (args, context) => {
			const action = args.trim();
			if (!["", "on", "off", "status"].includes(action)) {
				context.ui.notify("Use /yolo on|off|status, or /yolo to toggle. State unchanged.", "warning");
				return;
			}
			if (action === "status") {
				context.ui.notify(await active(context) ? YOLO_STATUS_TEXT : "YOLO OFF", "info");
				return;
			}
			if (action === "off") {
				policy.reset(); publish(context, false); context.ui.notify("YOLO OFF", "info");
				return;
			}
			const wasEnabled = policy.enabled;
			// Invalidate any earlier command awaiting Git before resolving this one.
			policy.reset();
			const epoch = policy.epoch;
			const identity = await capture(context);
			const enable = action === "on" || !wasEnabled;
			if (epoch !== policy.epoch) return;
			const changed = policy.set(enable, identity, epoch);
			const enabled = changed && policy.active(identity);
			publish(context, enabled);
			context.ui.notify(enabled ? YOLO_STATUS_TEXT : enable
				? "YOLO OFF — activation requires an interactive primary TUI session and an identifiable Git clone."
				: "YOLO OFF", enabled || !enable ? "info" : "warning");
		},
	});
	return { active, reset };
}
