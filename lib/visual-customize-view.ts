import { decodeKittyPrintable, isKeyRelease, matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { VisualProfile } from "./visual-profiles.ts";

export interface ProfileActions {
 list(): VisualProfile[];
 save(name: string, replace: boolean): void | Promise<void>;
 apply(name: string): void | Promise<void>;
 delete(name: string): void | Promise<void>;
 reset(): void | Promise<void>;
}

export interface CustomizeRow {
	label: string | (() => string);
	/** Read-only palette from the selected installed theme's source. */
	preview?: () => { title: string; sample: string };
	action(): void | Promise<void>;
}
export interface CustomizeViewOptions {
	profiles?: ProfileActions;
	rows: CustomizeRow[];
	theme: { fg(color: string, text: string): string };
	requestRender(): void;
	rowsAvailable?: () => number;
	onError?: (error: Error) => void;
	onClose(): void;
}

/** One interaction per instance; the selection survives updates to store-backed labels. */
export class VisualCustomizeView {
	private selected = 0;
	private closed = false;
	private busy = false;
	private profileOpen = false;
	private profileIndex = 0;
	private profileInput?: string;
	private profileWidth?: number;
	private confirmation?: { action: "replace" | "apply" | "delete" | "reset"; name?: string; fingerprint: string };
	private confirmationVisible = false;
	private inputVisible = false;
	private profileBusy = false;
	private profileError?: string;
	private readonly options: CustomizeViewOptions;
	openProfiles(): void { if (this.options.profiles) { this.profileOpen = true; this.options.requestRender(); } }
	private runProfile(action: () => void | Promise<void>): void {
		if (this.profileBusy) return;
		this.profileBusy = true;
		try {
			void Promise.resolve(action()).catch((error: unknown) => {
				this.profileError = error instanceof Error ? error.message : String(error);
				this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
			}).finally(() => { this.profileBusy = false; this.options.requestRender(); });
		} catch (error) {
			this.profileBusy = false;
			this.profileError = error instanceof Error ? error.message : String(error);
			this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
		}
	}
	private profileSize(width: number): { inner: number; height: number } {
		const rows = this.options.rowsAvailable?.() ?? 24;
		return { inner: Math.max(0, width - 2), height: Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0 };
	}
	private confirmationPrompt(choice: NonNullable<VisualCustomizeView["confirmation"]>, width: number): string | undefined {
		const prompt = `Confirm ${choice.action} ${choice.name ?? "catalog"}? y yes · any other key cancel`;
		return visibleWidth(prompt) <= width ? prompt : undefined;
	}
	private handleProfiles(data: string): void {
		const profiles = this.options.profiles!;
		if (matchesKey(data, Key.escape)) {
			if (this.profileInput !== undefined) this.profileInput = undefined;
			else if (this.confirmation) this.confirmation = undefined;
			else this.profileOpen = false;
		} else if (this.profileInput !== undefined) {
			if (matchesKey(data, Key.enter)) {
				const size = this.profileWidth === undefined ? undefined : this.profileSize(this.profileWidth);
				if (size && size.height >= 3 && this.inputVisible && visibleWidth(`New profile name: ${this.profileInput}▏`) <= size.inner) {
					const name = this.profileInput;
					this.profileInput = undefined;
					this.runProfile(() => profiles.save(name, false));
				}
			} else if (matchesKey(data, Key.backspace) || data === "\x7f") this.profileInput = [...this.profileInput].slice(0, -1).join("");
			else {
				const text = decodeKittyPrintable(data) ?? data;
				if ([...text].every(char => !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(char))) this.profileInput += [...text].slice(0, Math.max(0, 128 - [...this.profileInput].length)).join("");
			}
		} else if (this.confirmation) {
			const choice = this.confirmation;
			const size = this.profileWidth === undefined ? undefined : this.profileSize(this.profileWidth);
			const visible = this.confirmationVisible && size && size.height >= 3 && this.confirmationPrompt(choice, size.inner);
			this.confirmation = undefined;
			this.confirmationVisible = false;
			if (matchesKey(data, "y") && visible) {
				try {
					if (JSON.stringify(profiles.list()) !== choice.fingerprint) throw new Error("Profile catalog changed; choose again.");
					if (choice.action === "reset") this.runProfile(() => profiles.reset());
					else if (choice.name && profiles.list().some(item => item.name === choice.name)) {
						const name = choice.name;
						this.runProfile(() => choice.action === "replace" ? profiles.save(name, true) : choice.action === "apply" ? profiles.apply(name) : profiles.delete(name));
					}
				} catch (error) { this.profileError = error instanceof Error ? error.message : String(error); }
			}
		} else if (!this.profileBusy) {
			try {
				const items = profiles.list();
				if (matchesKey(data, Key.up) || matchesKey(data, "k")) this.profileIndex = (this.profileIndex + items.length - 1) % (items.length || 1);
				else if (matchesKey(data, Key.down) || matchesKey(data, "j")) this.profileIndex = (this.profileIndex + 1) % (items.length || 1);
				else if (matchesKey(data, "s")) { this.profileInput = ""; this.inputVisible = false; }
				else if (matchesKey(data, "z")) { this.confirmation = { action: "reset", fingerprint: JSON.stringify(items) }; this.confirmationVisible = false; }
				else if (items.length && (matchesKey(data, "r") || matchesKey(data, "a") || matchesKey(data, "d"))) {
					this.confirmation = { action: matchesKey(data, "r") ? "replace" : matchesKey(data, "a") ? "apply" : "delete", name: items[this.profileIndex]?.name, fingerprint: JSON.stringify(items) };
					this.confirmationVisible = false;
				}
			} catch (error) { this.profileError = error instanceof Error ? error.message : String(error); }
		}
		this.options.requestRender();
	}
	private renderProfiles(width: number): string[] {
		this.profileWidth = width;
		this.inputVisible = false;
		this.confirmationVisible = false;
		const { inner, height } = this.profileSize(width);
		if (!height || !width) return [];
		if (height < 3 || inner < 1) return ["Visual profiles", "Enlarge terminal"].slice(0, height).map(line => truncateToWidth(line, width, ""));
		let items: VisualProfile[];
		try { items = this.options.profiles!.list(); }
		catch (error) { return [`Visual profiles`, `Profiles unavailable: ${error instanceof Error ? error.message : String(error)}`, "Esc back"].slice(0, height).map(line => truncateToWidth(line, width, "")); }
		this.profileIndex = Math.min(this.profileIndex, Math.max(0, items.length - 1));
		const selected = items[this.profileIndex];
		const prompt = this.confirmation && this.confirmationPrompt(this.confirmation, inner);
		const lines: string[] = [];
		if (this.confirmation) { this.confirmationVisible = !!prompt; lines.push(prompt ?? "Confirmation unavailable · Esc back"); }
		if (this.profileInput !== undefined && lines.length < height) {
			const input = `New profile name: ${this.profileInput}▏`;
			this.inputVisible = visibleWidth(input) <= inner;
			lines.push(this.inputVisible ? input : "Name too long for terminal · Esc cancel");
		}
		lines.push("Visual profiles (preview only)", selected ? `${this.profileIndex + 1}/${items.length}: ${selected.name}` : "No saved profiles");
		if (selected) lines.push(`Theme: ${selected.themeName}`, `Animation: ${selected.animationPolicy} · Banner: ${selected.banner.color}`, `Layout: ${selected.visual.statusPlacement} · ${selected.visual.headerPlacement} · ${selected.visual.density}`);
		if (this.profileError) lines.push(`Error: ${this.profileError}`);
		lines.push("↑/↓ select · s save · r replace · a apply · d delete · z reset catalog · Esc back");
		return lines.slice(0, height).map(line => truncateToWidth(this.options.theme.fg("text", line), width, ""));
	}
	constructor(options: CustomizeViewOptions) { this.options = options; }

	handleInput(data: string): void {
		if (this.closed || isKeyRelease(data)) return;
		if (this.profileOpen && this.options.profiles) { this.handleProfiles(data); return; }
		if (this.options.profiles && matchesKey(data, "p")) { this.openProfiles(); return; }
		if (matchesKey(data, Key.escape)) { this.closed = true; this.options.onClose(); return; }
		const length = this.options.rows.length;
		if (length === 0) return;
		if (matchesKey(data, Key.up) || matchesKey(data, "k")) this.selected = (this.selected + length - 1) % length;
		else if (matchesKey(data, Key.down) || matchesKey(data, "j")) this.selected = (this.selected + 1) % length;
		else if ((matchesKey(data, Key.enter) || matchesKey(data, Key.space)) && !this.busy) {
			this.busy = true;
			try {
				void Promise.resolve(this.options.rows[this.selected]?.action()).catch((error: unknown) => {
					this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
				}).finally(() => { this.busy = false; if (!this.closed) this.options.requestRender(); });
			} catch (error) {
				this.busy = false;
				this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
			}
		}
		this.options.requestRender();
	}

	render(width: number): string[] {
		if (width <= 0) { this.confirmationVisible = false; this.inputVisible = false; this.profileWidth = undefined; return []; }
		if (this.profileOpen && this.options.profiles) return this.renderProfiles(width);
		const available = this.options.rowsAvailable?.() ?? 24;
		const height = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
		if (height === 0) return [];
		const length = this.options.rows.length;
		const showPreview = height >= 10 && !!this.options.rows[this.selected]?.preview;
		const count = Math.max(0, Math.min(length, height - (showPreview ? 5 : 3)));
		const start = Math.min(Math.max(0, this.selected - Math.floor(count / 2)), Math.max(0, length - count));
		const rows = length === 0
			? ["No settings available"]
			: this.options.rows.slice(start, start + count).map((row, index) => `${start + index === this.selected ? "▸" : " "} ${typeof row.label === "function" ? row.label() : row.label}`);
		let preview: { title: string; sample: string } | undefined;
		if (showPreview) {
			try { preview = this.options.rows[this.selected]?.preview?.(); }
			catch { /* Never substitute active colors for an unreadable source. */ }
		}
		const lines = height < 3 ? ["Visual customization", "Esc close"] : ["Visual customization", length ? `${start + 1}–${Math.min(start + count, length)} of ${length}` : "0 of 0", ...rows, ...(showPreview ? [preview ? `Preview · ${preview.title}` : "Preview unavailable", preview?.sample ?? "No source palette available"] : []), "↑/↓ or j/k · Enter/Space apply · Esc close"];
		return lines.slice(0, height).map((line, index) => truncateToWidth(this.options.theme.fg(index < 2 || index === this.selected - start + 2 ? "accent" : "text", line), width, ""));
	}
	invalidate(): void { this.options.requestRender(); }
}
