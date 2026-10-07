import { matchesKey } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	BUILTIN_NOTIFICATION_IDS, NOTIFICATION_EVENTS,
	type NotificationEvent, type NotificationSettings, type NotificationSound,
} from "./notification-policy.ts";
import { getNotificationService, type NotificationService } from "./notification-service.ts";
import type { CustomizeInline, CustomizeRow } from "./visual-customize-view.ts";

/** Silence first, then the builtins; Enter wraps back to silence. Priority is the event's, not the sound's. */
const SOUND_CYCLE: readonly NotificationSound[] = [null, ...BUILTIN_NOTIFICATION_IDS.map(id => `builtin:${id}` as const)];

function soundDescription(sound: NotificationSound): string {
	if (sound === null) return "silence";
	return sound.startsWith("builtin:") ? `${sound} · builtin tone` : `local WAV ${sound.slice(5)}`;
}

/**
 * Builds the Notifications category for the shared customize card. Every
 * label/preview is read-only, and every action resolves the owner facade at
 * action time: importing or rendering this module never discovers a player,
 * reads a file or writes settings. Rows use the inline bridge instead of
 * nested `ctx.ui.select/input/confirm` dialogs.
 */
export function buildNotificationRows(ctx: ExtensionContext): CustomizeRow[] {
	const category = "Notifications" as const;
	const notify = (message: string, error = false): void => { ctx.ui.notify(message, error ? "warning" : "info"); };
	const serviceOrNotify = (): NotificationService | undefined => {
		const service = getNotificationService();
		if (!service) notify("Audio notifications are unavailable in this session.", true);
		return service;
	};
	const state = () => getNotificationService()?.getState();
	/** Recovery consent is per attempt, strictly boolean, and re-resolved after every prompt. */
	const withRecovery = async (inline: CustomizeInline, run: (service: NotificationService, confirmRecovery: boolean) => boolean): Promise<void> => {
		const initial = serviceOrNotify();
		if (!initial) return;
		let confirmRecovery = false;
		const resolution = initial.getState();
		if (resolution.malformed || resolution.readError) {
			confirmRecovery = await inline.confirm("Replace invalid audio configuration? The existing file is malformed or unreadable.");
			if (!confirmRecovery || inline.disposed) return;
		}
		const service = getNotificationService();
		if (!service || inline.disposed) return;
		const ok = run(service, confirmRecovery);
		notify(ok ? "Audio notification preferences saved." : "Audio notification preferences not saved; choose again to retry.", !ok);
	};
	const mutate = (inline: CustomizeInline, change: (settings: NotificationSettings) => void): Promise<void> =>
		withRecovery(inline, (service, confirmRecovery) => {
			const settings = structuredClone(service.getState().settings);
			change(settings);
			return service.setConfig(ctx, settings, { confirmRecovery });
		});
	const restore = (inline: CustomizeInline): Promise<void> =>
		withRecovery(inline, (service, confirmRecovery) => service.restorePreset(ctx, { confirmRecovery }));
	const previewSound = (sound: NotificationSound): void => {
		const service = serviceOrNotify();
		if (!service) return;
		if (sound === null) { notify("Silence has no sound to preview; assign one first."); return; }
		if (!service.preview(ctx, sound)) notify("Preview unavailable or audio busy; try again.", true);
	};
	const chooseFile = async (inline: CustomizeInline, event: NotificationEvent): Promise<void> => {
		const expected = serviceOrNotify();
		if (!expected) return;
		const path = await inline.input({ prompt: "Local WAV path (absolute, no URLs)", value: "" });
		if (path === undefined) return;
		const sound = `file:${path}` as const;
		if (getNotificationService() !== expected) return;
		const valid = await expected.validateFile(ctx, sound);
		// A replaced owner, closed card or changed session invalidates the validated choice before any write.
		if (!valid || inline.disposed || getNotificationService() !== expected) {
			if (!inline.disposed && getNotificationService() === expected) notify("Select a readable regular PCM WAV (≤2 MiB, ≤5 seconds); absolute local path only.", true);
			return;
		}
		await mutate(inline, settings => { settings.audio.events[event] = sound; });
	};

	const rows: CustomizeRow[] = [];
	rows.push({
		category,
		label: () => { const current = state(); return `Audio notifications: ${current ? (current.settings.enabled ? "on" : "off") : "unavailable"}`; },
		preview: () => {
			const current = state();
			return { title: "Audio notifications · global switch",
				sample: current ? `opt-in audio · ${current.settings.enabled ? "enabled" : "disabled"} · mute: ${current.muted ? "on" : "off"} · separate from visual settings` : "Unavailable in this session" };
		},
		action: async inline => {
			const service = serviceOrNotify();
			if (!service) return;
			const enabled = !service.getState().settings.enabled;
			await mutate(inline, settings => { settings.enabled = enabled; });
		},
	});
	rows.push({
		category,
		label: () => { const current = state(); return `Audio: ${current ? (current.muted ? "muted" : "unmuted") : "unavailable"}`; },
		preview: () => ({ title: "Audio · process mute", sample: "mute survives reload and session replacement; restarting Pi clears it; muted or disabled events are never replayed" }),
		action: () => {
			const service = serviceOrNotify();
			if (!service) return;
			if (!service.setMuted(ctx, !service.getState().muted)) notify("Audio mute could not be changed.", true);
		},
	});
	rows.push({
		category,
		label: () => "Audio availability: check",
		preview: () => ({ title: "Audio availability · explicit probe", sample: "checks the lazy player only on request; rendering controls never detects or starts a player" }),
		action: async () => {
			const service = serviceOrNotify();
			if (!service) return;
			const result = await service.availability(ctx);
			if (getNotificationService() === service) notify(`Notification audio backend: ${result}.`);
		},
	});
	rows.push({
		category,
		label: () => "Audio: restore preset",
		preview: () => ({ title: "Audio · restore preset", sample: "restores recommended event sounds and timing while preserving the current on/off switch" }),
		action: async inline => {
			if (!serviceOrNotify()) return;
			await restore(inline);
		},
	});
	const events = getNotificationService()?.getState().supportedEvents
		?? NOTIFICATION_EVENTS.filter(event => event !== "session.shutdown");
	for (const event of events) {
		rows.push({
			category,
			label: () => { const current = state(); const sound = current?.settings.audio.events[event] ?? null; return `${event}: ${sound === null ? "silence" : sound}`; },
			preview: () => {
				const sound = state()?.settings.audio.events[event] ?? null;
				return { title: `${event} · audio event`, sample: `selected: ${soundDescription(sound)} · Enter cycles silence/success/error/attention · f local WAV · p test sound` };
			},
			action: async inline => {
				const service = serviceOrNotify();
				if (!service) return;
				const current = service.getState().settings.audio.events[event] ?? null;
				const index = SOUND_CYCLE.findIndex(candidate => candidate === current);
				const next = SOUND_CYCLE[(index + 1) % SOUND_CYCLE.length]!;
				await mutate(inline, settings => { settings.audio.events[event] = next; });
			},
			key: (data, inline) => {
				if (matchesKey(data, "p")) { previewSound(getNotificationService()?.getState().settings.audio.events[event] ?? null); return true; }
				// Return the field/validation promise so the view keeps the card busy until it settles.
				if (matchesKey(data, "f")) return chooseFile(inline, event);
				return false;
			},
		});
	}
	return rows;
}
