# Native notification audio backend — own Node Pulse client

Locator: `odd/tasks/native-audio-backend.md`
Worktree: `/home/egdev/proyectos/gentle-shell-native-audio` (gitdir linked to
`/home/egdev/proyectos/gentle-shell/.git/worktrees/gentle-shell-native-audio`)
Branch: `feat/native-notification-audio`, base `9a1f8a75` (clean tree; real
`node_modules` retained as ignored linked entries, no install performed).
N0 plan committed at **`9282b002`** [x] (399 lines); N1a codec committed at
**`b2bdee09`** [x] (518 authored lines). **N1b is in progress on top of that
commit** and stays unchecked until the parent commits it.

**Status: IMPLEMENTATION STARTED (N1a committed, N1b in progress).** The
protocol appendix below was read from the locally downloaded official
PulseAudio **v17.0** references (read-only, hashes verified) and corrected by the
**L2 independent document verification** (B1–B3, see the Log). N1a implements
the pure tagstruct/frame codec; N1b adds the Unix client transport, AUTH v13,
SET_CLIENT_NAME and the read-only GET_SERVER_INFO probe. A real read-only probe
against the local WSLg socket succeeded (`{available:true, formats:["wav"]}`);
no stream, no samples, no UI/activation. RED/GREEN are in L3/L4.
`lib/notification-pulse-protocol.ts` + `tests/notification-pulse-protocol.test.ts`.
No socket, cookie, stream, backend integration, process, runtime generation,
dependency, package, or global-config write happened. RED/GREEN are logged in L3.

## Objective

Give Gentle Shell's existing notification audio an opt-in, dependency-free
**native Linux/WSLg backend**: a minimal PulseAudio-wire v13 client written in
our own Node code (built-in `node:net` Unix socket), replacing the external CLI
player only where the native path is proven. macOS (CoreAudio) and Windows
(WASAPI) are planned later in phases with owned precompiled helpers. The native
path must never shadow the working external OGG/FLAC backend or overstate
physical support.

## Approval log (parent-relayed, not independently re-confirmed here)

- User: **"go"** to proceed.
- Phasing answer: **"IN PHASES"** — Linux/macOS/Windows staged; this turn starts
  Linux/WSLg, others planned/pending, never claimed as supported.
- Package answer: **"CLIENTE PROPIO SIN NUEVOS PAQUETES"** — own client, no new
  packages, no `pulseaudio.js` dependency, no new npm, no CLI player/system
  library install, no global config/activation, no physical play claim, no push
  PR, no subagents, no commits, no review in this turn. Parent performs local
  commits per unit.
- Source artifact to respect: user-provided `[ruta local anonimizada]`
  (reported 5.58 s) is intentionally rejected by the unchanged 5 s limit; it is
  not cropped, not raised.

## Measured baseline (this session, `9a1f8a75`)

- `node scripts/verify-package-files.mjs` → **174 required files, 69 byte-pinned
  contract artifacts** (passes).
- Generated runtime modules: **8** (`runtime/*.mjs`, `scripts/build-runtime-modules.mjs` sources).
- Node `v24.20.0`. Notification modules/tests present: `lib/notification-*.ts`,
  `tests/notification-*.test.ts` (7 files).
- Server evidence (existence only, no cookie content read):
  `/run/user/1000/pulse/native` → `/mnt/wslg/runtime-dir/pulse/native` (socket),
  sibling `pid`. **No cookie found** at `/run/user/1000/pulse/cookie`,
  `/mnt/wslg/runtime-dir/pulse/cookie`, `~/.config/pulse/cookie`,
  `~/.pulse-cookie`, and no `/etc/pulse/*`. Cookie resolution is therefore an
  open item (see U2), not an assumption.
- Historical baseline counts may drift; do not re-assert without re-measuring.

## Risks and mitigations (lead)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Wire opcode/token/field mismatch vs modern Pulse or PipeWire-Pulse | Resolved by the local PulseAudio **v17.0** reference read (below) and the verified wire/appendix tables; N1b's real read-only AUTH + ServerInfo probe still proves the server accepts our bytes before any stream code. |
| R2 | Native path silently shadows working external OGG/FLAC | Capabilities are **aggregated**, never replaced; native phase 1 advertises **WAV PCM only**; external backend keeps OGG/FLAC; routing is truthful; no `backend` schema change (`"auto"` stays). |
| R3 | Cookie exposure or creation | Read existing regular file only, `O_NOFOLLOW`, bounded ≤256 bytes, never create, never log contents, never send it anywhere but the local socket AUTH. |
| R4 | Accidental TCP / network / SHM / ancillary-FD surface | Explicit denial: Unix `SOCK_STREAM` only, no TCP, no network, no shared memory, no `SCM_RIGHTS`. **REQUEST is expected, not refused**: for non-SHM PCM it is handled by matching the current stream and accumulating bounded bytes; only SHM/memfd flag frames, refund/revoke control frames, and ancillary FDs fail closed. |
| R5 | Worker spawn overlap, leak, orphan, or lingering process | Reuse existing `permit.start()` **synchronous** gate immediately before spawn with no await; parent SIGKILL timeout 6000 ms; settle only on `close` + cleanup; single-flight reservation in the owner. |
| R6 | Packaging/binary creep (Addon, prebuilt, postinstall download, ABI) | Pure Node in a standalone generated `runtime/*.mjs` worker; no Addon, no binary, no ABI, no install step; `verify-package-files.mjs` reconciliation keeps runtime/sources/requiredPaths in sync. |
| R7 | WSLg path divergence | Resolve `/run/user/<uid>/pulse/native` first, then `/mnt/wslg/runtime-dir/pulse/native`; missing socket → unavailable → fallback preserved. |
| R8 | Physical-support overreach | Linux/WSLg first with a real read-only probe; macOS/Windows remain planned/pending; no "supported" claim without manual physical evidence. |
| R9 | Regression of 9a1 (`878`-restored) UI or OGG/FLAC behavior | Preserve the six-control basic card and existing validators/fallback verbatim; changes limited to routing/lifecycle and additive native capability. |
| R10 | Bulk/protocol sprawl and code golf | Minimal v13 subset only (AUTH, SET_CLIENT_NAME, GET_SERVER_INFO/default-sink probe, CREATE_PLAYBACK_STREAM, PLAYBACK_STREAM writes, DRAIN, DELETE); small appendix; ~400-line advisory per unit with tests kept with behavior. |

## Specs

- **S1 — Scope and authorization.** Planning only now. Linux/WSLg first; macOS/
  Windows phased and planned only. Own Node client. Forbidden: new packages,
  `pulseaudio.js` dependency, new npm, CLI player/system library install, global
  config/activation, physical-play claim, push/PR, subagents, this-turn commits
  or review. Parent commits locally per unit.
- **S2 — Isolation.** The native client runs as its own standalone Node worker
  (`runtime/notification-audio-native.mjs`) launched with `process.execPath`,
  argv only, `shell:false`. No Addon, no precompiled binary, no ABI dependency,
  no postinstall download. It is a directed parent→child helper, not an SDK
  agent, and it never loads the agent extension graph.
- **S3 — Transport.** Built-in `node:net` Unix `SOCK_STREAM` to the resolved
  Pulse socket. Explicitly no TCP, no network, no shared memory, no ancillary
  file descriptors. Packet framing is bounded and length-checked; malformed or
  oversized frames fail closed.
- **S4 — Protocol subset (v13).** Tagged tagstruct codec plus AUTH,
  SET_CLIENT_NAME, GET_SERVER_INFO/default-sink probe. **No streams and no
  samples** during probe, and no probe ever on import/render/off — only when the
  owner scheduler actually needs to play or an explicit preview happens.
- **S5 — PCM flow.** After a trusted snapshot, stream raw WAV PCM frames
  (mono/stereo, 8/16/24/32-bit, 8k–192k, ≥44-byte RIFF, ≤2 MiB, ≤5 s already
  enforced) then DRAIN and DELETE. Support cancel and socket close at any stage.
- **S6 — Snapshot and cleanup.** A trusted private snapshot is revalidated
  (content magic + limits) immediately before streaming, then drained and
  deleted. Abort/socket close are graceful; timeout is parent-driven SIGKILL at
  6000 ms; the promise settles only after `close` **and** cleanup, mirroring the
  existing `NotificationPlayer.run` contract.
- **S7 — Start gate.** `permit.start()` is called synchronously immediately
  before spawning the worker, with no `await` between the gate and the spawn, so
  the scheduler TTL/generation remains the final authority.
- **S8 — Context silence.** Child agents, headless mode, and all RPC remain
  silent via the existing `notificationContextAllowed` guard; only the
  interactive parent TUI can play.
- **S9 — Capability routing.** Aggregate native + external capabilities; native
  phase 1 = WAV only. External player detection and OGG/FLAC routing stay
  intact. No configuration schema change; `backend: "auto"` remains the only
  value. Native codec expansion (OGG/FLAC decode) is a future separate unit.
- **S10 — Cookie handling.** Read an existing regular cookie file only;
  `O_NOFOLLOW`, bounded ≤256 bytes, single bounded read, never created, never
  logged, never included in diagnostics. AUTH always carries **exactly 256
  bytes** (`PA_NATIVE_COOKIE_LENGTH`); when no cookie file exists we send 256
  zero bytes and rely on the local Unix peer credential (`SO_PEERCRED`
  `uid == getuid()`) for authorization. If the server rejects
  (`PA_COMMAND_ERROR`/`PA_ERR_ACCESS`), fail closed to the external backend.
- **S11 — Platform phases.** Linux/WSLg implementation and a real read-only
  probe are in scope for the first phases. macOS CoreAudio / Windows WASAPI use
  owned precompiled helpers and require CI minimum OS/arches, signing, supply
  chain, and future physical testing; no PowerShell, no installers, no newly
  claimed physical support.
- **S12 — Budget and evidence discipline.** Forecast **~1,350–1,600 authored
  lines total** (code + tests + runtime pack checks + docs; vendor 0), no code
  golf. Units N0–N5, ~400 advisory cap, tests stay with the behavior they
  protect; split once honestly if an indivisible unit exceeds the cap. Plan-only:
  RED/GREEN are **not active** and must not be fabricated.
- **S13 — Protocol provenance.** The local PulseAudio **v17.0** references are
  read-only: no dependency, not executed, not vendored. We derive the protocol
  declaration only (LGPL-2.1+ upstream implementation is not copied).
  `janakj/pulseaudio.js` 1.3.4 (ISC) remains an unread JS cross-check; if used,
  cite its pinned revision and human derivation, no code copy, credit if
  substantial borrow (disallowed without clear provenance).

## Protocol references (read-only, verified this turn)

Local set under `/tmp/gentle-native-audio-reference/`: official
`pulseaudio/pulseaudio` tag **v17.0**, fetched from
`https://raw.githubusercontent.com/pulseaudio/pulseaudio/v17.0/<path>` (read-only,
not a dependency, not executed, not vendored; upstream implementation is
LGPL-2.1+ and is not copied). Local SHA-256 verified equal to the parent list:

| Upstream path | SHA-256 (prefix) |
|---|---|
| `PROTOCOL` | `c84919fbec…dad0a22` |
| `src/pulsecore/native-common.h` | `17b6f9d7…6d587844` |
| `src/pulsecore/tagstruct.h` | `f6eeb000…e2afa318c` |
| `src/pulsecore/tagstruct.c` | `79e87b41…9dfb99b640` |
| `src/pulse/stream.c` | `c0c1eced…3b4478123` |
| `src/pulse/context.c` | `f2192d1f…398153b0` |
| `src/pulsecore/protocol-native.c` | `534873cd…d12d1871b25` |
| `src/pulsecore/pstream.h` | `9de05d0f…9f906279` |
| `src/pulsecore/pstream.c` | `318e43f2…ec9a5e7e` |
| `src/pulse/sample.h` | `ec2e621b…bd1571a9` |

Reading followed the parent's bound: targeted function bodies / tag defs / enum,
not the full large C files. The protocol declaration is derived from those
anchors; no upstream code is reproduced in this plan or copied into the client.

## Protocol appendix (verified, PulseAudio v17.0)

Citations are `file:line` in the set above. Numeric command values are the
C-enum order of `native-common.h:27+` (the enum *is* the wire value).

### Wire frame (20-byte descriptor)

Every frame begins with a descriptor of **5 big-endian `u32`**: `Length,
Channel, OffsetHi, OffsetLo, Flags` (`pstream.h:57-62,76`;
`PA_PSTREAM_DESCRIPTOR_SIZE` = 5×4 = 20 bytes). `Length` is the payload byte
count. Two frame kinds are distinguished by `Channel`:

| Frame kind | Channel | Flags | Payload | Source |
|---|---|---|---|---|
| Control/command | `0xffffffff` | `0` | tagstruct `[u32 command][u32 tag][args]` | `pstream.c:627-632,985-991` |
| PCM memblock | current stream index (≠ `0xffffffff`) | seek mode (`0` = relative) | raw PCM bytes only | `pstream.c:641-726,991-1010` |

Decode rejects a control frame whose flags ≠ 0, a memblock whose seek mode >
`PA_SEEK_RELATIVE_END`, and SHM/memfd flag frames (`pstream.c:985-1010`). PCM
write frames carry no tagstruct wrapper.

### Tagstruct codec

| Element | Layout | Source |
|---|---|---|
| `u32` | `'L'` + 4 bytes BE | `tagstruct.c:129,212-216` |
| `u8` | `'B'` + 1 byte | `tagstruct.c:219-223` |
| `string` | `'t'` + NUL-terminated bytes | `tagstruct.c:196-210` |
| `string NULL` | `'N'` | `tagstruct.c:209` |
| `arbitrary` | `'x'` + **raw BE `u32` length** + bytes | `tagstruct.c:236-242` |
| `boolean` | one byte `'1'`/`'0'` | `tagstruct.c:245-248` |
| `usec` | `'U'` + two BE `u32` | `tagstruct.c:261-264,147-150` |
| `proplist` | `'P'` + entries + `'N'`; each entry = `string` key + **tagged `u32` (`'L'`) valueLength** + `arbitrary` (`'x'` + **raw BE `u32`** valueLength + bytes). Both length fields carry the same value; do not confuse the tagged `u32` with the raw `arbitrary` length. | `tagstruct.c:313-335`, decoder `tagstruct.c:586-616` |

Tags (`tagstruct.h`): `STRING='t'`, `STRING_NULL='N'`, `U32='L'`, `U8='B'`,
`ARBITRARY='x'`, `BOOLEAN_TRUE='1'`/`FALSE='0'`, `USEC='U'`,
`SAMPLE_SPEC='a'`, `CHANNEL_MAP='m'`, `CVOLUME='v'`, `PROPLIST='P'`. Note the
upstream constraint: a proplist may only be at the end of a packet or before a
`STRING` (`tagstruct.h:26-28`).

Command values (enum order): `ERROR=0, TIMEOUT=1, REPLY=2,
CREATE_PLAYBACK_STREAM=3, DELETE_PLAYBACK_STREAM=4, AUTH=8, SET_CLIENT_NAME=9,
DRAIN_PLAYBACK_STREAM=12, GET_SERVER_INFO=20, REQUEST=61`.

Sample formats (`sample.h:134-183`): `U8=0`, `ALAW=1`, `ULAW=2`, `S16LE=3`,
`S16BE=4`, `FLOAT32LE=5`, `FLOAT32BE=6`, `S32LE=7`, `S32BE=8`, `S24LE=9`
(**packed** 24-bit LE), `S24BE=10`, `S24_32LE=11`, `S24_32BE=12`. WAV PCM maps
8→`U8`, 16→`S16LE`, **24→`S24LE` (packed, value 9) — not `S24_32LE` (11)**, 32
→`S32LE`; endianness follows the WAV container (LE).

### Message layouts (protocol v13)

| Message | Payload (after `u32 command, u32 tag`) | Source |
|---|---|---|
| AUTH (c→s) | `u32 version`, `arbitrary cookie` of exactly **256** bytes | `protocol-native.c:2576`, `native-common.h` (`PA_NATIVE_COOKIE_LENGTH 256`) |
| AUTH reply (s→c) | `u32 server_version \| flags` (`0x80000000` SHM, `0x40000000` memfd; top 16 bits reserved, stripped by `PA_PROTOCOL_VERSION_MASK`) | `protocol-native.c:2708`, `context.c:507-535` |
| SET_CLIENT_NAME (c→s, v13) | `proplist` (**not** a string; the client name is `PA_PROP_APPLICATION_NAME` inside the proplist) | `protocol-native.c:2763`, `context.c:578` |
| SET_CLIENT_NAME reply (v13) | `u32 client_index` | `protocol-native.c:2782` |
| GET_SERVER_INFO (c→s) | empty | `protocol-native.c:3685` |
| GET_SERVER_INFO reply (v13) | `string server_name`, `string server_version`, `string user`, `string host`, `sample_spec`, `string default_sink`, `string default_source`, `u32 cookie`; **v≥15 adds `channel_map` (excluded at v13)** | `protocol-native.c:3695-3730` |
| CREATE_PLAYBACK_STREAM (c→s, v13) | `sample_spec`, `channel_map`, `u32 sink_index`, `string sink_name`, `u32 maxlength`, `bool corked`, `u32 tlength`, `u32 prebuf`, `u32 minreq`, `u32 syncid`, `cvolume volume`, 7×`bool` (no_remap, no_remix, fix_format, fix_rate, fix_channels, no_move, variable_rate), `bool muted`, `bool adjust_latency`, `proplist` | `protocol-native.c:1909-1966` |
| CREATE_PLAYBACK_STREAM reply (v13) | `u32 stream_index`, `u32 sink_input_index`, `u32 missing` (**initial requested bytes**), v≥9 `u32 maxlength,tlength,prebuf,minreq`, v≥12 `sample_spec, channel_map, u32 sink_index, string sink_name, bool suspended`, v≥13 `usec configured_sink_latency` | `protocol-native.c:2077-2113` |
| PLAYBACK_STREAM write (c→s) | **PCM memblock frame** (not a tagstruct): descriptor `Channel = stream index`, `Flags = 0`, `Length = PCM bytes`; payload is raw PCM only | `pstream.c:641-726`, `stream.c:1538,1572` |
| DRAIN_PLAYBACK_STREAM (c→s) | `u32 stream_index`; empty `REPLY` when drained | `protocol-native.c:2828-2845` |
| DELETE_PLAYBACK_STREAM (c→s) | `u32 stream_index`; empty `REPLY` (simple ack) | `protocol-native.c:2141-2188` |
| ERROR (s→c) | `u32 error_code` and EOF | `context.c:448-459` |
| REPLY (s→c) | handler-defined body, matched by `tag` | `context.c:487-503` |
| REQUEST notification (s→c) | `u32 tag = 0xffffffff`, `u32 stream_index`, `u32 bytes`; the server pulls PCM from a **non-SHM** client | `protocol-native.c:686`, `playback_stream_request_bytes` `protocol-native.c:1117-1141`; client `context.c:75`, `stream.c:826-870` |
| SUBSCRIBE_EVENT / UNDERFLOW / … | unsolicited and **interspersed**; demultiplex by command/tag | `protocol-native.c:3739`, `context.c:355` |

**SHM disabled ≠ no REQUEST.** Our client announces `version = 13` with the SHM
MSB clear, so the server sets `shm_on_remote=false` and `do_shm=false`
(`protocol-native.c:2588-2600`, `context.c:522-539`) and never uses shared
memory. For **non-SHM** PCM the server still pulls data with unsolicited
`PA_COMMAND_REQUEST` notifications (`protocol-native.c:686`;
`playback_stream_request_bytes` `protocol-native.c:1117-1141`). The client must
handle REQUEST: match `stream_index` to the current stream, accumulate `bytes`
into a bounded remaining counter (cap adversarial values), and write PCM via
memblock frames (`stream.c:826-870`). The initial `missing` value in the
CreatePlaybackStream reply is the first request; later REQUEST notifications
continue. The client never sends REQUEST. We never send ancillary FDs; if
SHM/memfd-flag frames or SHM refund/revoke control frames ever arrive, fail
closed.

**Auth with no cookie file.** `PA_NATIVE_COOKIE_LENGTH` is 256, so AUTH always
carries exactly 256 bytes; with no cookie file we send 256 zero bytes. The
server authorizes on the local Unix `SO_PEERCRED` (`creds->uid == getuid()`,
possibly via `auth_group`) or the cookie; otherwise it replies
`PA_COMMAND_ERROR`/`PA_ERR_ACCESS` (`protocol-native.c:2610-2645`) and our
client fails closed to the external backend. A real read-only probe is **N1b**
only; **no probe evidence exists yet**.

## Tasks

| Unit | Intent | Candidate paths | Forecast (authored) | Acceptance / focused checks |
|---|---|---|---|---|
| **N0** | This plan, committed `9282b002` **[x]** (399 lines). | `odd/tasks/native-audio-backend.md` | 399 observed (docs) | Specs → Tasks → Log; measured baseline; L2 verification corrections (B1–B3) applied. RED/GREEN N/A. |
| **N1a** | Tagged tagstruct codec + bounded fake frames (no socket, no server). **[x] committed `b2bdee09`.** | `lib/notification-pulse-protocol.ts` (305), `tests/notification-pulse-protocol.test.ts` (213) | ≤400 forecast; **518 observed** | Round-trip encode/decode of the verified tags (`u32`, `u8`, `string`, `arbitrary`, `boolean`, `usec`, `sample_spec`, `cvolume`, `proplist`); command+tag prefix; bounded small frames; malformed/truncated fields fail closed. Unknown sample-format enum values may remain and block **N2**, not N1a. |
| **N1b** | Client transport: Unix connect, AUTH (v13/256-byte cookie/no-SHM), SET_CLIENT_NAME, GET_SERVER_INFO/default-sink. Real **read-only** probe (no stream/sample). **IN PROGRESS — local GREEN + real probe OK, awaiting parent commit.** | `lib/notification-pulse-client.ts` (328), `tests/notification-pulse-client.test.ts` (356) | ≤400 forecast; **684 observed** | Fake-server golden tests plus a real read-only probe that returns server info without opening a stream; ERROR/REPLY/timeout/interspersed handling; cookie absent → 256 zero bytes → peer-credential or fail closed. |
| **N2** | PCM flow + DRAIN + DELETE + cancel against a **fake Unix server, no audio**. | `lib/notification-pulse-stream.ts` (or client additions), `tests/notification-pulse-stream.test.ts`, fake-server fixture | ≤400 | CreatePlayback (v13 layout) → write frames → drain → delete; `missing` requested-bytes honored; 24-bit/format mapping resolved; cancel/socket-close; backpressure; malformed/oversized frame; error and timeout paths. |
| **N3** | Standalone worker + generated JS runtime + resource/pack limits (generated slice accounted separately). | `lib/notification-audio-native.ts` (worker entry), `scripts/build-runtime-modules.mjs` (add sources), generated `runtime/*.mjs`, `scripts/verify-package-files.mjs` (required paths), `tests/notification-audio-native.test.ts` | ≤300 authored | Worker runs standalone under `process.execPath`; generator/`runtime/`/`requiredPaths` reconcile; snapshot revalidate → stream → delete; SIGKILL timeout/settle-on-close. Authored source/tests stay under cap; generated bytes and runtime count (8 → 11–12) are reported as their own measured numbers. |
| **N4** | Auto-routing selection + lifecycle/context + preserve system fallback + UI/docs. | `lib/notification-audio.ts`, `lib/notification-service.ts`, `lib/notification-customize.ts` (labels only if needed), `docs/sound-notifications.md`, `tests/notification-audio.test.ts`, `tests/gentle-notifications.test.ts`, `tests/notification-customize.test.ts` | 240–320 | Aggregate capabilities; native WAV never shadows external OGG/FLAC; `permit.start()` sync gate; child/headless/RPC silent; six-control card and 9a1 OGG/FLAC fallback preserved. |
| **N5** | Default full / typecheck / package offline functional closure. | docs + closure records only | 60–120 | Focused suites, `pnpm run typecheck` (ratchet, no regressions), `pnpm run check:runtime-modules`, `node scripts/verify-package-files.mjs`; record exact commands/results. |

Dependencies: **N1a → N1b → N2 → N3 → N4 → N5**; N0 precedes all. Each unit
is independently committed by the **parent** after its focused checks pass. If a
unit exceeds ~400 authored lines without a clean split, record the honest delta
in the Log rather than trimming tests or code-golfing.

**Generated-slice accounting (N3).** The native client may be generated as
**3–4 runtime helpers** copied from `lib/*.ts`
(`runtime/notification-pulse-protocol.mjs`, `-client.mjs`, `-stream.mjs`,
`notification-audio-native.mjs`). Generated bytes are counted **separately**
from authored source/test lines — not a native-case budget exception: authored
source+tests stay within the unit cap and the generated artifact plus the
`requiredPaths`/runtime-module count (8 → 11–12) are reported as their own
measured numbers, no code golf.

## Provisional artifacts

- New (planned): `lib/notification-pulse-protocol.ts` (tagstruct codec),
  `lib/notification-pulse-client.ts` (transport/auth/probe),
  `lib/notification-pulse-stream.ts` (PCM/drain/delete; may merge into the
  client), `lib/notification-audio-native.ts` (worker entry); generated
  `runtime/notification-pulse-protocol.mjs`, `-client.mjs`, `-stream.mjs`,
  `notification-audio-native.mjs`; the matching tests and fake-server fixture.
- Modified (planned): `scripts/build-runtime-modules.mjs`,
  `scripts/verify-package-files.mjs`, `lib/notification-audio.ts`,
  `lib/notification-service.ts`, `lib/notification-customize.ts` (only if a
  label must mention native/fallback), `docs/sound-notifications.md`.
- Explicitly unchanged: `lib/notification-policy.ts` schema (no new `backend`
  value), `lib/notification-scheduler.ts`, `extensions/gentle-notifications.ts`
  context guards, the six-control basic card, and the 9a1 OGG/FLAC validators.

## Uncertainties and open items

- **U1 — Sample-format enum: RESOLVED.** `sample.h:134-183` gives `U8=0`,
  `S16LE=3`, `S32LE=7`, `S24LE=9` (packed), `S24BE=10`, `S24_32LE=11`. Packed
  24-bit WAV maps to `S24LE` (9), **not** `S24_32LE` (11). No remaining gap.
- **U2 — Native packet header: RESOLVED.** `pstream.h:57-62,76` gives the
  20-byte descriptor = 5 BE `u32` `Length, Channel, OffsetHi, OffsetLo, Flags`;
  `pstream.c:612-730,985-1010` gives the frame/decode rules. No remaining gap.
- **U3 — Cookie/auth on WSLg.** No cookie file exists at the usual paths and no
  `/etc/pulse/*` config is present. Plan: send 256 zero bytes and rely on
  `SO_PEERCRED` same-uid auth; otherwise fail closed. Never read/log cookie bytes.
- **U4 — SHM/REQUEST: corrected.** `[PA_COMMAND_REQUEST]=NULL` in the server
  table is the **inbound** (client→server) dispatch only; the server still
  **emits** REQUEST outbound for non-SHM PCM. Client handling is specified in
  the appendix; no ancillary FDs are ever used and SHM/memfd frames fail closed.
- **U5 — Worker packaging model.** Confirm a generated `runtime/*.mjs` child
  process (vs `worker_threads`) reconciles cleanly with the pack verifier.
- **U6 — Physical evidence.** The real probe is N1b (read-only, no sound) and
  **no probe evidence exists yet**; audible output on WSLg and any Linux desktop
  variant remains pending manual verification. No support is claimed until then.
- **U7 — Baseline drift.** Runtime count (8), resources (174), and pins (69)
  were measured at `9a1f8a75`; N3 will change the first two and must re-measure.
- **U8 — Native review unavailable: resolved for the doc stage.** The managed
  assets remain outdated and the sync was not executed, so **native review is
  still unavailable**. The independent document verifier did run on the staged
  plan and returned the B1–B3 corrections now applied; a staged passive
  structural ASSESS needs no independent run. Tooling state, not a source risk.

## Log

### N0 — Planning turn (this document)

- Approval relayed by the parent: "go"; phases "IN PHASES"; own client "SIN
  NUEVOS PAQUETES"; start Linux/WSLg. Logged as relayed, not re-litigated.
- Read (bounded): `lib/notification-audio.ts`, `lib/notification-service.ts`,
  `lib/notification-policy.ts`, `lib/notification-customize.ts` (guard/row
  context), `extensions/gentle-notifications.ts`, `odd/tasks/sound-notifications.md`
  (S9/S12/S14–S17 + L7/L9), `docs/sound-notifications-proposal.md`,
  `scripts/build-runtime-modules.mjs`, `scripts/verify-package-files.mjs`.
- Measured: `node scripts/verify-package-files.mjs` → 174 files / 69 pins
  (exit 0); runtime modules 8; tree clean at `9a1f8a75`; pulse socket symlink
  exists; no cookie at standard paths; Node v24.20.0.
- No code, tests, runtime generation, assets, dependency, package, or global
  config was written. RED/GREEN are not active for a documentation-only turn;
  no RED/GREEN evidence is claimed. No implementation/support/physical claim.
- Protocol references (read before implementation): official PulseAudio **v17.0**
  `PROTOCOL`, `src/pulsecore/native-common.h`, `tagstruct.h/.c`,
  `protocol-native.c`, `src/pulse/stream.c`, `src/pulse/context.c`; JS
  `janakj/pulseaudio.js` 1.3.4 (ISC, unread cross-check only, no dependency/copy).
- Next: begin **N1a** (codec + bounded fake frames) with focused RED/GREEN and a
  local parent commit.

### N0b — Reference read, protocol appendix (this turn)

- Local read-only set `/tmp/gentle-native-audio-reference/` = PulseAudio tag
  **v17.0**; all seven SHA-256 digests re-computed and equal to the parent list.
  Not a dependency, not executed, not vendored; upstream is LGPL-2.1+ and no
  implementation code was copied.
- Targeted reads only (function bodies / tag defs / enum): `tagstruct.c:90-380`,
  `native-common.h` command enum + cookie constants, `protocol-native.c`
  AUTH/CREATE_PLAYBACK_STREAM/DELETE/DRAIN/GET_SERVER_INFO/set_client_name,
  `context.c` AUTH/SET_CLIENT_NAME/ERROR dispatch.
- Verified and recorded: 20-byte command frame header; payload prefix
  `u32 command, u32 tag`; ASCII tag tokens and BE `u32`; AUTH = `u32 version` +
  exactly 256-byte cookie; v13 SHM MSB clear ⇒ SHM/memfd off (the outbound
  REQUEST handling was corrected in L2: the server still emits REQUEST for
  non-SHM PCM); SET_CLIENT_NAME
  v13 uses a **proplist** (client name is `PA_PROP_APPLICATION_NAME`);
  GET_SERVER_INFO v13 fields (no `channel_map`); CREATE_PLAYBACK_STREAM v13
  request and reply (`missing` requested bytes); DRAIN/DELETE shapes; ERROR =
  `u32 error_code`; interspersed REPLY/EVENT handling.
- Doc changes: N1 blocker (upstream unread) removed; protocol appendix replaced
  with the verified wire/message tables + citations; N1 split into **N1a** and
  **N1b** (each ≤400); N2 ≤400; N3 generated slice accounted separately; U-items
  rewritten (U1 = sample-format enum blocks N2 not N1a); native-review/untracked
  state recorded (U8).
- Still DOCS ONLY: no code, no tests, no source execution, no audio, no server
  connect, no global config, no cookie content read. RED/GREEN not active; none
  claimed. N1a was ready to start pending staging/verification.

### L2 — Independent document verification corrections

Independent document verifier ran on the staged plan and returned **3
substantive corrections (B1–B3)**, and **2 open items (U1, U2) closed** now that
`pstream.h/.c` and `sample.h` are in the reference set (3 new files; the original
7 digests preserved). Applied:

- **B1** — "no SHM" ≠ "no REQUEST". The server emits `PA_COMMAND_REQUEST` for
  non-SHM PCM (`protocol-native.c:686`, bytes at `:1117-1141`); the client
  matches the stream and accumulates (`context.c:75`, `stream.c:826-870`). Fixed
  R4, the SHM paragraph, U4, and the appendix REQUEST row; the initial `missing`
  value **and** later REQUEST notifications are both required.
- **B2** — PCM is a memblock frame (descriptor `Channel=stream index`, `Flags=0`,
  `Length=bytes`, raw PCM payload), never a tagstruct packet; control frames use
  `Channel=0xffffffff`, `Flags=0` (`pstream.c:612-730,985-1010`;
  `stream.c:1538,1572`). Fixed the write row.
- **B3** — `proplist` entry = string key + tagged `u32` (`'L'`) valueLength +
  arbitrary value (its own **raw BE `u32`** length, same value) + `'N'`
  terminator (`tagstruct.c:313-335`, decoder `:586-616`). Fixed before N1a.

Auth v13 / no-SHM sources were confirmed correct; no sample read/play; the
cookie-absent plan is 256 zero bytes → local peer credential / authAnonymous,
else fail. Still DOCS ONLY: no tests, code, source execution, audio, server
connect, global config, or cookie content read. Passive doc close; ~399 lines,
within the 400 planning allowance (no shrink/code-golf). N1a is ready after
these fixes; **no source implementation until the parent's explicit follow-up**.

### L3 — N1a codec: RED before source, GREEN, triangulation

- Route: single writer, focused. Surfaces: `lib/notification-pulse-protocol.ts`,
  `tests/notification-pulse-protocol.test.ts`, this doc.
- **RED observed before any production source**: `node --experimental-strip-types
  --test tests/notification-pulse-protocol.test.ts` → exit 1, `ERR_MODULE_NOT_FOUND`
  for `lib/notification-pulse-protocol.ts`, 0 pass / 1 fail. The test file was
  written first and the module did not exist (honest first-creation RED).
- **GREEN**: the same command after the pure module → 16/16, exit 0.
- **TRIANGULATE**: added memblock nonzero-offset/seek, binary proplist value,
  encoder oversize/channel rejection, empty push → **19/19, exit 0**.
- **Surrounding (proportionate, no full suite)**: `node --experimental-strip-types
  --test tests/*notification*.test.ts` → 141/141 pass, exit 0.
  `node scripts/check-types.mjs` → exit 0, **186 recorded diagnostics, no
  regressions**, 12 pairs improved (baseline 186 unchanged; no `--update`).
  `git diff --check` clean.
- **IO zero**: the module is pure — no `node:fs`/`node:net`/timers/process/spawn;
  the tests touch no fs, network, clock, or process.
- **Cost (honest overage)**: source 305 + tests 213 = **518 authored lines**, over
  the 350–400 forecast by ~118–168; cohesive golden vectors and the full verified
  primitive set, deliberately not code-golfed. Reported before any extra scope.
- API delivered for N1b/N2: `NATIVE_PROTOCOL_VERSION`, `CONTROL_CHANNEL`,
  `PulseCommand`, `MAX_CONTROL_PAYLOAD`, `MAX_FRAMES_PER_PUSH`,
  `boundedPulseTagWriter/Reader`, `encodePulseFrame`, `boundedPulseFrameDecoder`
  (readable generic errors, no values echoed).
- N1a stays **unchecked** until the parent commits it. Next: **N1b** (client
  transport, AUTH, real read-only probe), not started.

### L4 — N1b client: RED before source, GREEN, real read-only probe

- Route: single writer, focused. Surfaces: `lib/notification-pulse-client.ts`,
  `tests/notification-pulse-client.test.ts`, this doc. N1a committed at
  `b2bdee09`; the upstream protocol errors B1–B3 remain corrected.
- **RED observed before any production source**: `node --experimental-strip-types
  --test tests/notification-pulse-client.test.ts` → exit 1,
  `ERR_MODULE_NOT_FOUND` for `lib/notification-pulse-client.ts`, 0 pass / 1 fail.
- **GREEN**: same command after the pure client → 18/18, exit 0.
- **TRIANGULATE**: symlinked socket path (WSLg style, followed without rewrite)
  and zero-cookie-from-missing-path with no file creation → **20/20, exit 0**.
- **Surrounding (no full suite)**: `node --experimental-strip-types --test
  tests/*notification*.test.ts` → 161/161 pass, exit 0. `node scripts/check-types.mjs`
  → exit 0, **186 recorded diagnostics, no regressions** (baseline 186, no
  `--update`). `git diff --check` clean.
- **Real read-only WSLg probe (permitted after GREEN)**: `PulseClient().probe()`
  → `{"available":true,"formats":["wav"]}`, exit 0. AUTH v13 with a 256-zero
  cookie was accepted (local peer credentials / anonymous), SET_CLIENT_NAME and
  GET_SERVER_INFO returned a default sink. **No stream was created, no samples
  sent, no config/UI activation, no cookie file created** (standard paths still
  absent), and only `available`/`formats` were printed — no cookie, user, host or
  path.
- **IO surface**: `node:fs`, `node:fs/promises`, `node:net`, `node:os` only; no
  packages, addons or third-party code; no logging; lazy — import/constructor do
  no IO and only `connect()`/`probe()` dial the socket.
- **Cost (honest overage)**: source 328 + tests 356 = **684 authored lines**, over
  the 400–500 forecast by ~184–284; cohesive golden vectors, independent
  fake-server replies, and the full safety matrix (socket/cookie guards, bounds,
  abort/close, fragments, SHM, multiplex/timeout) were kept, not code-golfed.
  Reported before any extra scope.
- API for N2: `PulseClient` (`connect`, `request`, `authenticate`, `serverInfo`,
  `probe`, `sendDataFrame`, `close`, `onEvent`), `resolvePulseSocketPath`,
  `resolvePulseCookiePath`, `loadPulseCookie`, `PulseCookieError`; generic
  value-free errors.
- N1b stays **unchecked** until the parent commits it. Next: **N2** PCM flow
  (fake Unix server, drain/cancel), not started.
