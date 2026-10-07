import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdtemp, open, rmdir, unlink, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isNotificationSound, type NotificationSound } from "./notification-policy.ts";
import type { PlaybackPermit } from "./notification-scheduler.ts";

const MAX_BYTES = 2 * 1024 * 1024;
const PLAYBACK_TIMEOUT_MS = 6000;
const STDERR_LIMIT = 4096;
/** Strict RIFF PCM: unknown chunks allowed, with word padding; one fmt and one nonempty data. */
export function validateNotificationWav(bytes: Buffer): number {
	const invalid = () => { throw new TypeError("Invalid notification WAV"); };
	if (bytes.length < 44 || bytes.length > MAX_BYTES || bytes.toString("ascii", 0, 4) !== "RIFF"
		|| bytes.toString("ascii", 8, 12) !== "WAVE" || bytes.readUInt32LE(4) + 8 !== bytes.length) return invalid();
	let offset = 12; let format: { rate: number; align: number } | undefined; let dataSize: number | undefined;
	while (offset < bytes.length) {
		if (offset + 8 > bytes.length) return invalid();
		const id = bytes.toString("ascii", offset, offset + 4); const size = bytes.readUInt32LE(offset + 4);
		const start = offset + 8; const end = start + size;
		if (end + (size % 2) > bytes.length) return invalid();
		if (id === "fmt ") {
			if (format || (size !== 16 && size !== 18) || bytes.readUInt16LE(start) !== 1
				|| (size === 18 && bytes.readUInt16LE(start + 16) !== 0)) return invalid();
			const channels = bytes.readUInt16LE(start + 2); const rate = bytes.readUInt32LE(start + 4);
			const bits = bytes.readUInt16LE(start + 14); const align = channels * bits / 8;
			if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000 || ![8, 16, 24, 32].includes(bits)
				|| bytes.readUInt16LE(start + 12) !== align || bytes.readUInt32LE(start + 8) !== rate * align) return invalid();
			format = { rate, align };
		} else if (id === "data") {
			if (!format || dataSize !== undefined || size === 0) return invalid();
			dataSize = size;
		}
		offset = end + (size % 2);
	}
	if (!format || dataSize === undefined || dataSize % format.align !== 0) return invalid();
	const duration = dataSize / format.align / format.rate * 1000;
	if (duration > 5000) return invalid();
	return duration;
}

export type NotificationAudioFormat = "wav" | "ogg" | "flac";
/** Content detection only (magic bytes, never the extension). Unknown containers are refused
 *  so an unrecognized file can never reach the player as white noise. */
export function validateNotificationAudio(bytes: Buffer): { format: NotificationAudioFormat; durationMs: number } {
	let format: NotificationAudioFormat;
	let durationMs: number;
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
		format = "wav"; durationMs = validateNotificationWav(bytes);
	} else if (bytes.toString("ascii", 0, 4) === "fLaC") {
		format = "flac"; durationMs = validateNotificationFlac(bytes);
	} else if (bytes.toString("ascii", 0, 4) === "OggS") {
		format = "ogg"; durationMs = validateNotificationOgg(bytes);
	} else throw new TypeError("Unsupported notification audio format");
	// WAV already enforces this internally; the shared guard also bounds the decoded OGG/FLAC durations.
	if (durationMs > 5000) throw new TypeError("Notification audio exceeds 5 seconds");
	return { format, durationMs };
}
/** FLAC duration from STREAMINFO: the first metadata block must be STREAMINFO of exactly 34 bytes
 *  and total samples must be known, otherwise a duration limit cannot be verified. */
export function validateNotificationFlac(bytes: Buffer): number {
	const invalid = () => { throw new TypeError("Invalid notification FLAC"); };
	if (bytes.length < 42 || bytes.length > MAX_BYTES || bytes.toString("ascii", 0, 4) !== "fLaC") return invalid();
	const lastFlagAndType = bytes[4];
	const length = (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
	if ((lastFlagAndType & 0x7f) !== 0 || length !== 34) return invalid();
	const s = 8;
	const sampleRate = (bytes[s + 10] << 12) | (bytes[s + 11] << 4) | (bytes[s + 12] >> 4);
	const channels = ((bytes[s + 12] >> 1) & 0x07) + 1;
	const bitsPerSample = (((bytes[s + 12] & 0x01) << 4) | (bytes[s + 13] >> 4)) + 1;
	const totalSamples = (bytes[s + 13] & 0x0f) * 2 ** 32 + bytes.readUInt32BE(s + 14);
	if (sampleRate < 8000 || sampleRate > 192000 || channels < 1 || channels > 2
		|| bitsPerSample < 4 || bitsPerSample > 32 || totalSamples <= 0) return invalid();
	return totalSamples / sampleRate * 1000;
}
/** OGG duration from the last page granule, without decoding: Vorbis uses the header sample rate,
 *  Opus is always 48 kHz and subtracts the header pre-skip. Only Vorbis/Opus are accepted. */
export function validateNotificationOgg(bytes: Buffer): number {
	const invalid = () => { throw new TypeError("Invalid notification OGG"); };
	if (bytes.length < 27 || bytes.length > MAX_BYTES) return invalid();
	let offset = 0; let first = true; let opus = false;
	let channels: number | undefined; let sampleRate: number | undefined; let preSkip = 0;
	let endGranule = 0; let foundGranule = false;
	while (offset < bytes.length) {
		if (offset + 27 > bytes.length) return invalid();
		if (bytes.toString("ascii", offset, offset + 4) !== "OggS" || bytes[offset + 4] !== 0) return invalid();
		const headerType = bytes[offset + 5];
		const low = bytes.readUInt32LE(offset + 6); const high = bytes.readInt32LE(offset + 10);
		const noGranule = high === -1 && low === 0xffffffff;
		const pageSegments = bytes[offset + 26];
		if (offset + 27 + pageSegments > bytes.length) return invalid();
		let bodySize = 0;
		for (let i = 0; i < pageSegments; i++) bodySize += bytes[offset + 27 + i];
		const bodyStart = offset + 27 + pageSegments; const next = bodyStart + bodySize;
		if (next > bytes.length) return invalid();
		if (first) {
			// The BOS page must carry the identification header for exactly one supported codec.
			if ((headerType & 0x02) === 0) return invalid();
			if (bodySize >= 7 && bytes[bodyStart] === 0x01 && bytes.toString("ascii", bodyStart + 1, bodyStart + 7) === "vorbis") {
				if (bodySize < 16) return invalid();
				channels = bytes[bodyStart + 11]; sampleRate = bytes.readUInt32LE(bodyStart + 12);
			} else if (bodySize >= 8 && bytes.toString("ascii", bodyStart, bodyStart + 8) === "OpusHead") {
				if (bodySize < 12) return invalid();
				channels = bytes[bodyStart + 9]; preSkip = bytes.readUInt16LE(bodyStart + 10);
				sampleRate = 48000; opus = true;
			} else return invalid();
			first = false;
		}
		if (!noGranule) { const value = high * 2 ** 32 + low; if (!foundGranule || value > endGranule) endGranule = value; foundGranule = true; }
		offset = next;
	}
	if (first || !foundGranule || channels === undefined || sampleRate === undefined || channels < 1 || channels > 2) return invalid();
	if (!opus && (sampleRate < 8000 || sampleRate > 192000)) return invalid();
	const durationMs = opus ? Math.max(0, endGranule - preSkip) / 48000 * 1000 : endGranule / sampleRate * 1000;
	if (!(durationMs > 0)) return invalid();
	return durationMs;
}
export interface AudioIO {
	open(path: string, flags: number): Promise<{
		stat(): Promise<{ isFile(): boolean; size: number }>;
		read(buffer: Buffer): Promise<{ bytesRead: number }>;
		close(): Promise<void>;
	}>;
	mkdtemp(prefix: string): Promise<string>;
	chmod(path: string, mode: number): Promise<void>;
	writeFile(path: string, bytes: Buffer, options: { mode: number; flag: "wx" }): Promise<void>;
	unlink(path: string): Promise<void>;
	rmdir(path: string): Promise<void>;
}
export interface AudioChild extends EventEmitter {
	stderr: EventEmitter | null;
	kill(signal: "SIGKILL"): boolean;
}
export interface AudioOptions {
	platform?: string;
	io?: AudioIO;
	tempRoot?: string;
	builtinRoot?: string;
	executableAvailable?(path: string): Promise<boolean>;
	spawn?(executable: string, args: string[], options: {
		shell: false; windowsHide: true; detached: false; stdio: ["ignore", "ignore", "pipe"];
	}): AudioChild;
	setTimeout?(fn: () => void, ms: number): ReturnType<typeof setTimeout> | number;
	clearTimeout?(timer: ReturnType<typeof setTimeout> | number): void;
}
const defaultIO: AudioIO = { open, mkdtemp, chmod, writeFile, unlink, rmdir };
/** Owner invokes only for enable/preview (or explicit availability UI). No import-time detection/IO.
 * Windows deliberately unavailable until a safe native adapter and manual evidence exist.
 * Source symlinks are rejected (O_NOFOLLOW); descriptor read is bounded, then validated bytes
 * are snapshotted into a private directory so subsequent source mutation cannot affect playback. */
export class NotificationPlayer {
	private readonly options: AudioOptions;
	private readonly io: AudioIO;
	private detection?: Promise<string | undefined>;
	constructor(options: AudioOptions = {}) { this.options = options; this.io = options.io ?? defaultIO; }
	async availability(): Promise<"available" | "unavailable"> {
		return await this.detect() ? "available" : "unavailable";
	}
	/** Reuses the cached lazy detection only; never starts playback. Unknown executables advertise nothing. */
	async capabilities(): Promise<Set<NotificationAudioFormat>> {
		const executable = await this.detect();
		const name = executable ? basename(executable) : "";
		if (name === "paplay" || name === "pw-play") return new Set<NotificationAudioFormat>(["wav", "ogg", "flac"]);
		if (name === "aplay") return new Set<NotificationAudioFormat>(["wav"]);
		// macOS afplay reliably plays WAV and FLAC; OGG is unverified on macOS and therefore excluded.
		if (name === "afplay") return new Set<NotificationAudioFormat>(["wav", "flac"]);
		return new Set();
	}
	private detect(): Promise<string | undefined> {
		return this.detection ??= (async () => {
			const platform = this.options.platform ?? process.platform;
			const candidates = platform === "linux" ? ["/usr/bin/paplay", "/usr/bin/pw-play", "/usr/bin/aplay"]
				: platform === "darwin" ? ["/usr/bin/afplay"] : [];
			for (const path of candidates) {
				try {
					const available = this.options.executableAvailable ? await this.options.executableAvailable(path)
						: await access(path, constants.X_OK).then(() => true);
					if (available) return path;
				} catch { /* Missing/denied executable is a local availability result, not an agent failure. */ }
			}
			return undefined;
		})();
	}
	async play(sound: Exclude<NotificationSound, null>, signal: AbortSignal, permit: PlaybackPermit): Promise<void> {
		if (signal.aborted) return;
		const executable = await this.detect();
		if (!executable || signal.aborted) return;
		if (!isNotificationSound(sound, "posix")) throw new TypeError("Invalid notification sound");
		const source = sound.startsWith("file:") ? sound.slice(5)
			: join(this.options.builtinRoot ?? fileURLToPath(new URL("../assets/sounds/", import.meta.url)), `${sound.slice(8)}.wav`);
		const handle = await this.io.open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		let bytes: Buffer; let format: NotificationAudioFormat;
		try {
			const stat = await handle.stat();
			if (!stat.isFile() || stat.size > MAX_BYTES || stat.size < 44) throw new TypeError("Invalid notification file");
			const buffer = Buffer.alloc(MAX_BYTES + 1);
			// One bounded descriptor read: short reads fail closed rather than accepting truncation.
			const { bytesRead } = await handle.read(buffer);
			if (bytesRead !== stat.size) throw new TypeError("Notification file changed or truncated");
			bytes = Buffer.from(buffer.subarray(0, bytesRead));
			format = validateNotificationAudio(bytes).format;
		} finally { await handle.close(); }
		if (signal.aborted) return;
		const directory = await this.io.mkdtemp(join(this.options.tempRoot ?? tmpdir(), "gentle-notification-"));
		const snapshot = join(directory, `sound.${format}`);
		try {
			await this.io.chmod(directory, 0o700);
			await this.io.writeFile(snapshot, bytes, { mode: 0o600, flag: "wx" });
			if (signal.aborted || !permit.start()) return;
			// No await between permit and spawn: scheduler TTL/generation owns the final start gate.
			await this.run(executable, snapshot, signal);
		} finally {
			try { await this.io.unlink(snapshot); } catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Audio snapshot cleanup failed");
			} finally { await this.io.rmdir(directory); }
		}
	}
	private run(executable: string, snapshot: string, signal: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = (this.options.spawn ?? spawn)(executable, [snapshot], {
				shell: false, windowsHide: true, detached: false, stdio: ["ignore", "ignore", "pipe"],
			});
			let failed = false; let timedOut = false; let killed = false; let stderr = Buffer.alloc(0);
			const capture = (chunk: Buffer | string) => {
				const remaining = STDERR_LIMIT - stderr.length;
				if (remaining > 0) stderr = Buffer.concat([stderr, Buffer.from(typeof chunk === "string" ? chunk.slice(0, remaining) : chunk.subarray(0, remaining)).subarray(0, remaining)]);
			};
			const kill = () => {
				if (!killed) {
					killed = true;
					try { child.kill("SIGKILL"); } catch { failed = true; } // Keep reservation until close even if OS denies kill.
				}
			};
			const error = () => { failed = true; }; // Node emits close after error even for failed spawn.
			child.stderr?.on("data", capture); child.on("error", error);
			const timer = (this.options.setTimeout ?? setTimeout)(() => { timedOut = true; kill(); }, PLAYBACK_TIMEOUT_MS);
			signal.addEventListener("abort", kill, { once: true });
			child.once("close", (code: number | null) => {
				(this.options.clearTimeout ?? clearTimeout)(timer);
				signal.removeEventListener("abort", kill); child.removeListener("error", error);
				child.stderr?.removeListener("data", capture); stderr = Buffer.alloc(0);
				if (signal.aborted) resolve();
				else if (timedOut || failed || code !== 0) reject(new Error(timedOut ? "Audio playback timed out" : "Audio process failed"));
				else resolve();
			});
			if (signal.aborted) kill();
		});
	}
}
