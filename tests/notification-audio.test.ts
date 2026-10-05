import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NotificationPlayer, validateNotificationWav, type AudioIO } from "../lib/notification-audio.ts";
import { NotificationScheduler } from "../lib/notification-scheduler.ts";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../lib/notification-policy.ts";

function wav(samples = 800) {
	const b = Buffer.alloc(44 + samples * 2);
	b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
	b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
	b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples * 2, 40); return b;
}
class Child extends EventEmitter {
	stderr = new EventEmitter(); kills: string[] = [];
	kill(signal: string) { this.kills.push(signal); return true; }
}
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture(platform = "linux") {
	const child = new Child(); const calls: Array<{ executable: string; args: string[]; options: unknown }> = [];
	const probes: string[] = []; const cleaned: string[] = []; const writes: Array<{ path: string; bytes: Buffer; mode: number }> = [];
	let bytes: Buffer = wav(); let regular = true; let size = bytes.length; let available = true;
	let detect: (() => Promise<boolean>) | undefined;
	let spawnError = false; let writeError = false; let cleanupError = false;
	let duringRead: (() => void) | undefined;
	let timeout: (() => void) | undefined; let cleared = 0;
	const io: AudioIO = {
		open: async (_path, flags) => {
			assert.ok(flags & constants.O_NOFOLLOW); assert.ok(flags & constants.O_NONBLOCK);
			return { stat: async () => ({ isFile: () => regular, size }),
				read: async buffer => { duringRead?.(); bytes.copy(buffer); return { bytesRead: bytes.length }; }, close: async () => {} };
		},
		mkdtemp: async () => "/private/audio ; literal", chmod: async (_path, mode) => { assert.equal(mode, 0o700); },
		writeFile: async (path, data, options) => { if (writeError) throw Error("write"); writes.push({ path, bytes: data, mode: options.mode }); },
		unlink: async path => { cleaned.push(path); if (cleanupError) throw Error("cleanup"); }, rmdir: async path => { cleaned.push(path); },
	};
	const player = new NotificationPlayer({ platform, io, tempRoot: "/private", builtinRoot: "/builtins",
		executableAvailable: async path => { probes.push(path); return detect ? detect() : available; },
		spawn: (executable, args, options) => { if (spawnError) throw Error("spawn"); calls.push({ executable, args, options }); return child; },
		setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => { cleared++; },
	});
	const signal = new AbortController(); let permits = 0;
	const play = (allow = true) => player.play("file:/input/a ; &(b).wav", signal.signal, { start: () => { permits++; return allow; } });
	return { player, child, calls, probes, cleaned, writes, signal, play, timeout: () => timeout!(), cleared: () => cleared,
		permits: () => permits, setAvailable: (v: boolean) => { available = v; }, setDetect: (v: () => Promise<boolean>) => { detect = v; },
		setBytes: (v: Buffer) => { bytes = v; size = v.length; }, setRegular: () => { regular = false; },
		setSize: (v: number) => { size = v; }, failSpawn: () => { spawnError = true; }, failWrite: () => { writeError = true; },
		failCleanup: () => { cleanupError = true; }, onRead: (fn: () => void) => { duringRead = fn; } };
}

test("WAV content and coherent PCM limits, not filename extension", () => {
	assert.equal(validateNotificationWav(wav()), 100);
	assert.equal(validateNotificationWav(wav(40000)), 5000);
	const mutations = [
		(b: Buffer) => b.write("NOPE"), (b: Buffer) => b.write("MP3!", 8),
		(b: Buffer) => b.writeUInt32LE(1, 4), (b: Buffer) => b.writeUInt16LE(3, 20),
		(b: Buffer) => b.writeUInt16LE(0, 22), (b: Buffer) => b.writeUInt32LE(0, 24),
		(b: Buffer) => b.writeUInt32LE(1, 28), (b: Buffer) => b.writeUInt16LE(1, 32),
		(b: Buffer) => b.writeUInt16LE(7, 34), (b: Buffer) => b.writeUInt32LE(0xffffffff, 40),
		(b: Buffer) => b.writeUInt32LE(1, 40), (b: Buffer) => b.writeUInt32LE(0, 40),
	];
	for (const mutate of mutations) { const b = wav(); mutate(b); assert.throws(() => validateNotificationWav(b)); }
	for (const b of [wav().subarray(0, 43), wav(40001), Buffer.alloc(2 * 1024 * 1024 + 1)]) assert.throws(() => validateNotificationWav(b));
});

test("RIFF chunk padding, duplicates and bounds are validated", () => {
	const original = wav(); const junk = Buffer.from([74, 85, 78, 75, 1, 0, 0, 0, 42, 0]);
	const extended = Buffer.concat([original.subarray(0, 36), junk, original.subarray(36)]);
	extended.writeUInt32LE(extended.length - 8, 4); assert.equal(validateNotificationWav(extended), 100);
	for (const extra of [original.subarray(12, 36), original.subarray(36), Buffer.from([1, 2, 3])]) {
		const b = Buffer.concat([original, extra]); b.writeUInt32LE(b.length - 8, 4);
		assert.throws(() => validateNotificationWav(b));
	}
});

test("detection lazy, cached, trusted absolute candidates only; absence and Windows silent", async () => {
	const f = fixture(); assert.deepEqual(f.probes, []); f.setAvailable(false);
	await f.play(); await f.play(); assert.equal(f.calls.length, 0); assert.equal(f.permits(), 0);
	assert.deepEqual(f.probes, ["/usr/bin/paplay", "/usr/bin/pw-play", "/usr/bin/aplay"]);
	assert.equal(await f.player.availability(), "unavailable");
	const win = fixture("win32"); await win.play(); assert.deepEqual(win.probes, []); assert.equal(win.calls.length, 0);
	const mac = fixture("darwin"); assert.equal(await mac.player.availability(), "available"); assert.deepEqual(mac.probes, ["/usr/bin/afplay"]);
	const denied = fixture(); denied.setDetect(async () => { throw Error("denied"); }); await denied.play(); assert.equal(denied.calls.length, 0);
});

test("private snapshot, literal argv, no shell/detach; settle only after close and cleanup", async () => {
	const f = fixture(); let done = false; const p = f.play().then(() => { done = true; }); await tick();
	assert.equal(f.permits(), 1); assert.equal(done, false); assert.equal(f.calls.length, 1);
	assert.deepEqual(f.calls[0], { executable: "/usr/bin/paplay", args: ["/private/audio ; literal/sound.wav"],
		options: { shell: false, windowsHide: true, detached: false, stdio: ["ignore", "ignore", "pipe"] } });
	assert.equal(f.writes[0].mode, 0o600); assert.deepEqual(f.writes[0].bytes, wav());
	f.child.emit("exit", 0); await tick(); assert.equal(done, false);
	f.child.emit("close", 0); await p; assert.equal(done, true); assert.equal(f.cleaned.length, 2); assert.equal(f.cleared(), 1);
});

test("abort before/during detection, validation and late false permit never spawn", async () => {
	const before = fixture(); before.signal.abort(); await before.play(); assert.deepEqual(before.probes, []);
	const during = fixture(); let resolve!: (v: boolean) => void;
	during.setDetect(() => new Promise(r => { resolve = r; })); const p = during.play(); await tick();
	during.signal.abort(); resolve(true); await p; assert.equal(during.calls.length, 0); assert.equal(during.permits(), 0);
	const validation = fixture(); validation.onRead(() => validation.signal.abort()); await validation.play(); assert.equal(validation.calls.length, 0);
	const late = fixture(); await late.play(false); assert.equal(late.calls.length, 0); assert.equal(late.cleaned.length, 2);
});

test("abort and timeout kill but keep reservation until close; bounded stderr and failure cleanup", async () => {
	for (const cancel of ["abort", "timeout"]) {
		const f = fixture(); let done = false; const p = f.play().then(() => { done = true; }, () => { done = true; }); await tick();
		f.child.stderr.emit("data", Buffer.alloc(100000, 65));
		if (cancel === "abort") f.signal.abort(); else f.timeout();
		assert.deepEqual(f.child.kills, ["SIGKILL"]); await tick(); assert.equal(done, false); assert.equal(f.cleaned.length, 0);
		f.child.emit("close", null); await p; assert.equal(f.cleaned.length, 2); assert.equal(f.child.stderr.listenerCount("data"), 0);
	}
	const failed = fixture(); const p = failed.play(); await tick(); failed.child.emit("error", Error("secret stderr"));
	await tick(); assert.equal(failed.cleaned.length, 0); failed.child.emit("close", -1);
	await assert.rejects(p, /Audio process failed/); assert.equal(failed.cleaned.length, 2);
	const nonzero = fixture(); const exit = nonzero.play(); await tick(); nonzero.child.emit("close", 1); await assert.rejects(exit, /Audio process failed/);
});

test("filesystem failures and synchronous spawn failure always clean snapshot", async () => {
	for (const setup of [(f: ReturnType<typeof fixture>) => f.setRegular(),
		(f: ReturnType<typeof fixture>) => f.setSize(2 * 1024 * 1024 + 1),
		(f: ReturnType<typeof fixture>) => f.setBytes(wav().subarray(0, 20)),
		(f: ReturnType<typeof fixture>) => f.setSize(wav().length + 2)]) {
		const f = fixture(); setup(f); await assert.rejects(f.play()); assert.equal(f.calls.length, 0);
	}
	for (const fail of ["write", "spawn"]) {
		const f = fixture(); if (fail === "write") f.failWrite(); else f.failSpawn();
		await assert.rejects(f.play()); assert.equal(f.cleaned.length, 2);
	}
	const cleanup = fixture(); cleanup.failCleanup(); const p = cleanup.play(); await tick(); cleanup.child.emit("close", 0);
	await assert.rejects(p, /cleanup/); assert.equal(cleanup.cleaned.length, 2);
	for (const sound of ["file:https://example.org/a.wav", "file:relative.wav", "builtin:other"]) {
		const f = fixture(); await assert.rejects(f.player.play(sound as "file:relative.wav", f.signal.signal, { start: () => true })); assert.equal(f.calls.length, 0);
	}
});

test("scheduler reservation does not overlap aborted child still awaiting close", async () => {
	const f = fixture(); const s = new NotificationScheduler({ now: () => 0, setTimeout: () => 1, clearTimeout: () => {},
		player: (sound, signal, permit) => f.player.play(sound, signal, permit) });
	assert.equal(s.preview("builtin:success"), true); await tick();
	s.configure(structuredClone(DEFAULT_NOTIFICATION_SETTINGS), true);
	assert.equal(s.preview("builtin:error"), false); assert.equal(f.calls.length, 1);
	f.child.emit("close", null); await tick(); assert.equal(f.cleaned.length, 2);
	assert.equal(s.preview("builtin:error"), true); await tick(); assert.equal(f.calls.length, 2);
	f.child.emit("close", 0); await tick(); s.dispose();
});

test("all original builtin WAV assets pass the same validator", async () => {
	for (const id of ["success", "error", "attention"]) {
		const bytes = await readFile(new URL(`../assets/sounds/${id}.wav`, import.meta.url));
		assert.ok(validateNotificationWav(bytes) > 0);
	}
});
