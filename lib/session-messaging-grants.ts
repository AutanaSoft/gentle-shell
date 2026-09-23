import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { sanitizeTerminalText } from "./terminal-theme.ts";

/**
 * Supported decision tokens for cross-orchestrator communication consent.
 */
export const MESSAGING_CONSENT_DECISIONS = {
	ALLOW_ONCE: "Allow once",
	ALLOW_SESSION: "Allow for this session",
	DENY: "Deny",
} as const;

export type MessagingConsentDecision =
	(typeof MESSAGING_CONSENT_DECISIONS)[keyof typeof MESSAGING_CONSENT_DECISIONS];

/**
 * Options for requesting human authorization before outbound cross-session communication.
 */
export interface MessagingConsentOptions {
	/** Outbound message payload. */
	message: string;
	/** Concrete reason explaining why this communication is needed. */
	reason?: string;
	/** Optional abort signal for request cancellation. */
	signal?: AbortSignal;
}

/**
 * Ephemeral in-memory grant manager for cross-orchestrator communication.
 * Permissions are scoped strictly to the live session identity and session manager instance.
 */
export class SessionMessagingGrants {
	private readonly grants = new Map<string, Set<string>>();
	private manager?: ExtensionContext["sessionManager"];
	private sessionId?: string;

	/**
	 * Authorizes an outbound cross-orchestrator message to the given recipient.
	 * Prompts the user interactively when no session-level grant exists, and fails closed otherwise.
	 */
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

		const cleanMessage = sanitizeTerminalText(options.message);
		const cleanReason = options.reason ? sanitizeTerminalText(options.reason).trim() : undefined;
		const reason = cleanReason && cleanReason.length > 0
			? cleanReason
			: `Notification from session ${id}`;

		const isTruncated = cleanMessage.length > 200;
		const messageLabel = isTruncated
			? `Message (${cleanMessage.length} chars, preview): ${cleanMessage.slice(0, 197)}...`
			: `Message: ${cleanMessage}`;
		const title = `Authorize cross-orchestrator message to ${sanitizeTerminalText(recipient)}?\nReason: ${reason}\n${messageLabel}`;

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

	/**
	 * Checks whether a live session-level grant exists for the target recipient in the current session.
	 */
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
