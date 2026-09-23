import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const MESSAGING_CONSENT_DECISIONS = {
	ALLOW_ONCE: "Allow once",
	ALLOW_SESSION: "Allow for this session",
	DENY: "Deny",
} as const;

export type MessagingConsentDecision =
	(typeof MESSAGING_CONSENT_DECISIONS)[keyof typeof MESSAGING_CONSENT_DECISIONS];

export interface MessagingConsentOptions {
	message: string;
	reason?: string;
	signal?: AbortSignal;
}

// Deliberately ephemeral: in-memory only, bound to the live session identity and session manager.
export class SessionMessagingGrants {
	private readonly grants = new Map<string, Set<string>>();
	private manager?: ExtensionContext["sessionManager"];
	private sessionId?: string;

	async authorize(
		ctx: Pick<ExtensionContext, "sessionManager" | "hasUI" | "ui">,
		recipient: string,
		options: MessagingConsentOptions
	): Promise<void> {
		if (options.signal?.aborted) throw new Error("Cross-orchestrator message authorization aborted.");
		const id = ctx.sessionManager.getSessionId();
		if (!id) throw new Error("Cross-orchestrator communication requires an active session identity.");
		if (this.manager !== ctx.sessionManager || this.sessionId !== id) {
			this.grants.clear();
			this.manager = ctx.sessionManager;
			this.sessionId = id;
		}
		if (this.grants.get(id)?.has(recipient)) return;

		if (!ctx.hasUI || typeof ctx.ui?.select !== "function") {
			throw new Error("Cross-orchestrator communication requires interactive human consent before sending.");
		}

		const preview = options.message.length > 200 ? `${options.message.slice(0, 197)}...` : options.message;
		const reasonLine = options.reason ? `Reason: ${options.reason}\n` : "";
		const title = `Authorize cross-orchestrator message to ${recipient}?\n${reasonLine}Message: ${preview}`;

		const selected = await ctx.ui.select(
			title,
			[
				MESSAGING_CONSENT_DECISIONS.ALLOW_ONCE,
				MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION,
				MESSAGING_CONSENT_DECISIONS.DENY,
			],
			{ signal: options.signal }
		);

		if (options.signal?.aborted) throw new Error("Cross-orchestrator message authorization aborted.");
		if (ctx.sessionManager !== this.manager || ctx.sessionManager.getSessionId() !== id) {
			throw new Error("Session identity changed during authorization.");
		}

		if (selected === MESSAGING_CONSENT_DECISIONS.ALLOW_SESSION) {
			const sessionGrants = this.grants.get(id) ?? new Set<string>();
			sessionGrants.add(recipient);
			this.grants.set(id, sessionGrants);
			return;
		}

		if (selected === MESSAGING_CONSENT_DECISIONS.ALLOW_ONCE) {
			return;
		}

		throw new Error("Cross-orchestrator communication denied by user.");
	}

	assertCurrent(ctx: Pick<ExtensionContext, "sessionManager">, recipient: string): boolean {
		if (
			ctx.sessionManager !== this.manager ||
			!this.sessionId ||
			ctx.sessionManager.getSessionId() !== this.sessionId
		) {
			return false;
		}
		return this.grants.get(this.sessionId)?.has(recipient) ?? false;
	}
}
