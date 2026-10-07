# Sound notifications

Audio is **off by default**. In a primary Pi terminal, open `/gentle:customize` → **Notifications** → **Notification settings**. This closes the appearance overlay and opens native dialogs; audio preferences are separate from visual settings, profiles and visual reset. No new command is needed.

## Use the panel

- **Enable audio / Disable audio** saves the global switch. Opening the panel does not discover a player or enable anything.
- **Assign sound** selects origin (`session`, `agent`, `subagent`), then a supported event, then Silence, a builtin, or Local WAV file. Each mapping is independent. Selecting a file validates it without playing it.
- **Preview sound** explicitly chooses a sound to listen to. It bypasses disabled/muted automatic audio but does not save, enable audio or replay past events. An active or pending sound can make preview busy; retry explicitly.
- **Mute / Resume** affects this process only, surviving reload and session replacement. Restarting Pi clears mute. Muting/disabling discards pending events; resuming never replays them.
- **Check availability** explicitly performs the lazy player probe. Availability means an executable was found, not proof of working speakers or a live audio server.
- **Restore preset** restores the recommended mappings and timing while preserving the current enabled switch.

Escape cancels a dialog without saving its choice. Invalid/unreadable configuration disables automatic audio. Saving or restoring in that state requires a fresh explicit confirmation to replace it; cancel preserves the file and settings. A failed write does not grant consent to the next attempt. Diagnostics are generic local UI notices, not conversation messages, tools, model context or agent state.

## Supported events and defaults

| Origin | Events | Recommended sound |
| --- | --- | --- |
| Session | `session.started` | Silence |
| Main agent | `agent.started`, `agent.cancelled` | Silence |
| Main agent | `agent.completed` | `builtin:success` |
| Main agent | `agent.failed` | `builtin:error` |
| Main agent | `agent.attention` | `builtin:attention` |
| Subagent | `subagent.queued`, `subagent.running`, `subagent.waiting`, `subagent.cancelled` | Silence |
| Subagent | `subagent.completed` | `builtin:success` |
| Subagent | `subagent.failed`, `subagent.timed_out` | `builtin:error` |

`session.started` means initial process startup only, once per process, not reload/new/resume/fork. Main outcomes use settled-run evidence; `agent_end` is not success. Attention is an active main-run edge from the existing explicit intervention lifecycle (`herdr:blocked`), not every dialog. Subagent waiting does not imply attention. Restored tasks/history and unchanged snapshots are silent.

**Shutdown limitation:** `session.shutdown` remains in the schema for compatibility but is excluded from the runtime/UI catalog. Lazy playback cannot reliably finish during immediate cleanup without delaying exit. The historical best-effort proposal is not a promise of a quit sound; shutdown cancels audio instead.

## Global configuration

Only `<gentlePiConfigHome()>/notifications.json` is read. It normally resolves to `~/.pi/gentle-ai/notifications.json`; `GENTLE_PI_CONFIG_HOME` overrides the directory. No repository override can activate audio. Missing configuration reads the preset with `enabled: false`, without creating a file. Saved files are strict, not merged with defaults: omitted event keys and `null` both mean silence, including after upgrades.

Complete default schema (the shutdown entry is inert):

```json
{
  "schema": "gentle-shell.notifications/v1",
  "enabled": false,
  "audio": {
    "backend": "auto",
    "minimumIntervalMs": 1000,
    "coalesceWindowMs": 300,
    "events": {
      "session.started": null,
      "session.shutdown": null,
      "agent.started": null,
      "agent.completed": "builtin:success",
      "agent.failed": "builtin:error",
      "agent.cancelled": null,
      "agent.attention": "builtin:attention",
      "subagent.queued": null,
      "subagent.running": null,
      "subagent.waiting": null,
      "subagent.completed": "builtin:success",
      "subagent.failed": "builtin:error",
      "subagent.cancelled": null,
      "subagent.timed_out": "builtin:error"
    }
  }
}
```

Unknown keys/schema/events are rejected. `enabled` must be boolean; backend must be `auto`; timing values are integer milliseconds: minimum interval 0–60000, coalesce window 0–2000, inclusive. Zero disables that timing window, not the TTL. Writes use an exclusive 0600 temporary file beside the target followed by atomic rename. Changes apply to the live owner immediately and invalidate stale pending mappings. Direct external edits are read on the next session attachment/reload, not polled in the background.

## Local WAV security

Builtins `success`, `error`, `attention` are original synthetic tones under the [MIT license, provenance and reproduction recipe](../assets/sounds/LICENSE.md).

Enter a **literal absolute local path** in the file dialog (without the `file:` prefix). JSON references use `file:/absolute/path/my sound.wav`. Spaces and punctuation are literal; no shell interprets them. No URLs, UNC/network or device paths, relative paths, `~`, environment expansion, commands or configurable player executables. Selection and playback both validate; extension alone does not prove format.

Allowed content: RIFF/WAVE integer PCM (format 1), mono or stereo, 8/16/24/32-bit, 8000–192000 Hz, nonempty aligned data, coherent chunk bounds/padding and rate metadata; maximum **2 MiB** and **5 seconds**. Compressed/float/extensible WAV is not accepted. The final source must be a readable regular file, not a symlink or FIFO. No-follow/nonblocking descriptor opening, bounded reads and WAV validation fail closed. Intermediate directories are not a sandbox against other same-user filesystem writers.

Playback revalidates and snapshots the bytes in a private 0700 temporary directory with an exclusive 0600 WAV, then uses a trusted absolute executable with separate literal argv and `shell:false`. Source changes after selection cannot substitute unchecked playback bytes. Abort/timeout kills the child; the serial reservation is held until close and cleanup, not merely until kill was requested. Playback timeout is 6000 ms. OS-denied termination/cleanup cannot be guaranteed by mocks.

## Noise and retention

Only the primary **TUI** owner plays. Child processes, print/JSON and **all RPC**, including interactive RPC hosts, are silent. There is no desktop notification or BEL fallback. Two independent Pi processes can overlap; serialization is per process.

Ráfagas coalesce into at most one pending candidate, in event priority order: failed/timed_out > main attention > completed > other. Changing the sound does not change event priority. Equal priority selects the latest sound but keeps the first coalesce deadline. Starts respect the minimum interval. Pending events expire at age **2000 ms** (including slow discovery/validation); they are dropped rather than forming a late queue. Preview remains subject to context, file validation, serialization and timeout.

The scheduler keeps a bounded 256-identity FIFO. The owner additionally retains the highest sequence **per producer/run** for the active parent session, across reload, preventing old wire duplicates after FIFO eviction. This map is not size-capped: it costs O(distinct runs) during a long session, is cleared when attaching a different session ID, and disappears on process exit. The actual TaskStore producer increments a store-global sequence on each status change, but current retention is still keyed per run; no producer-wide compaction is claimed here. Muted/off occurrences are consumed, not buffered.

## Platforms and manual verification

| Platform | Adapter implemented | Physical listening / UI / reload / quit |
| --- | --- | --- |
| Linux | First executable among `/usr/bin/paplay`, `/usr/bin/pw-play`, `/usr/bin/aplay` | **PENDING / UNVERIFIED**; no player available in the reported development environment |
| macOS | `/usr/bin/afplay` | **PENDING / UNVERIFIED** |
| Windows | Deliberately unavailable; no native adapter yet | **PENDING**; no playback support claim |

No system dependencies are installed automatically. No available player produces silence plus a bounded local warning, not an agent failure. SSH and containers play on the process host, not necessarily your client; an executable may exist without a usable device/server. Automated tests use injected clocks/processes and WAV validation; they do **not** establish physical audio or manual TUI correctness.

Manual acceptance remains pending for every applicable platform:

- [ ] Navigate customize → Notifications in narrow/wide, regular/fullscreen terminals; cancel every dialog.
- [ ] Assign a valid local WAV with spaces, preview off/muted, enable, verify live outcomes and independent mappings; verify bad files and consent cancellation preserve bytes.
- [ ] Mute and reload/change session, then resume without replay; confirm no probe while off unless explicitly requested.
- [ ] Quit/reload during probe, validation and active playback: no late spawn, overlap, stale write, leaked process or delayed exit.
- [ ] Listen to builtin/custom tones and exercise missing player, failed player and hanging player on the real host.

Implementation progress and automated evidence live in the [ODD task](../odd/tasks/sound-notifications.md). Full closure and manual acceptance are not inferred from the mock suite.
