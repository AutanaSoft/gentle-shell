import { isKeyRelease, matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";

export interface CustomizeRow {
	label: string | (() => string);
	action(): void | Promise<void>;
}
export interface CustomizeViewOptions {
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
	private readonly options: CustomizeViewOptions;
	constructor(options: CustomizeViewOptions) { this.options = options; }

	handleInput(data: string): void {
		if (this.closed || isKeyRelease(data)) return;
		if (matchesKey(data, Key.escape)) { this.closed = true; this.options.onClose(); return; }
		const length = this.options.rows.length;
		if (length === 0) return;
		if (matchesKey(data, Key.up) || matchesKey(data, "k")) this.selected = (this.selected + length - 1) % length;
		else if (matchesKey(data, Key.down) || matchesKey(data, "j")) this.selected = (this.selected + 1) % length;
		else if ((matchesKey(data, Key.enter) || matchesKey(data, " ")) && !this.busy) {
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
		if (width <= 0) return [];
		const available = this.options.rowsAvailable?.() ?? 24;
		const height = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
		if (height === 0) return [];
		const length = this.options.rows.length;
		const count = Math.max(0, Math.min(length, height - 3));
		const start = Math.min(Math.max(0, this.selected - Math.floor(count / 2)), Math.max(0, length - count));
		const rows = length === 0
			? ["No settings available"]
			: this.options.rows.slice(start, start + count).map((row, index) => `${start + index === this.selected ? "▸" : " "} ${typeof row.label === "function" ? row.label() : row.label}`);
		const lines = height < 3 ? ["Visual customization", "Esc close"] : ["Visual customization", length ? `${start + 1}–${Math.min(start + count, length)} of ${length}` : "0 of 0", ...rows, "↑/↓ or j/k · Enter/Space apply · Esc close"];
		return lines.slice(0, height).map((line, index) => truncateToWidth(this.options.theme.fg(index < 2 || index === this.selected - start + 2 ? "accent" : "text", line), width, ""));
	}
	invalidate(): void { this.options.requestRender(); }
}
