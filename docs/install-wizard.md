# Installation preflight (wizard groundwork)

The read-only preflight module inventories prerequisites and returns an ordered
plan. **There is no working browser wizard or clean-machine bootstrap yet.**
For ordinary installation and terminal use, follow the [README](../README.md).

## What is available

`scripts/installer-preflight.mjs` exports three small integration surfaces:

| API | Contract |
| --- | --- |
| `requirements` | Repository-derived Node/Pi minima, pnpm acquisition pin, package version, native installer pin and Windows Go minimum. |
| `collectInventory({ platform, arch, probes })` | Calls injected named read-only probes serially. Missing/failed probes become unknown; error text is not retained. |
| `planPreflight(inventory)` | Pure classification and ordered action intents; no commands, downloads, installation or setup execution. |

Current requirements come from `package.json` and
[`gentle-ai-installer.mjs`](../scripts/gentle-ai-installer.mjs): Node ≥22.19.0,
Pi ≥0.99.1, pnpm acquisition 11.1.1, Gentle Shell package 4.0.0 and package-local
Gentle AI 4.0.0. Windows native source builds require Go ≥1.25.10 when the
required usable native binary is missing. A reusable binary does not require Go.
Pins change with the repository; the API reads the metadata rather than copying
these values into a second installer.

## Probe adapter contract

Supply `platform` as `linux`, `darwin` or `win32`, and `arch` as `x64` or `arm64`.
These are planning targets, **not evidence of native OS/libc support**. Other
pairs produce an unsupported-target blocker and no actions. Native lanes,
minimum OS versions, libc compatibility, artifact trust and elevation handling
remain to be verified in later units.

Probes are named `node`, `pnpm`, `pi`, `shell`, `gentleAi`, `go`, `globalBin`, and
`setup`. There are deliberately no built-in host process probes yet. Adapters
must use bounded read-only checks, never launcher setup, postinstall, paid model
requests, credential inspection or home writes. The collector cannot enforce
purity of caller-provided functions; adapter implementations require review.

- Tool observations use `{ available: true, version, usable: true }`; absence is
  `{ available: false }`. Unknown availability, usability or unparseable versions
  block planning. Versions are exact stable `major.minor.patch` strings (optional
  `v` prefix); prereleases and raw command output are unknown, not silently reused.
- Shell additionally needs `global: true`, proving normal global ownership.
  Compatible newer Node, Pi and Shell versions are reused, never downgraded.
- pnpm additionally needs `compatible: true`, based on its actual Node engine and
  required global-install capabilities. The acquisition pin is not a minimum:
  newer compatible pnpm is reusable. Do not infer compatibility from its version
  alone; the later acquisition adapter must validate the pinned engine too.
- Gentle AI additionally needs `compatible: true`: evidence from the normal
  package-local binary resolution/integrity contract, for the selected Shell
  installation. Its exact installer pin is required; another version blocks
  rather than being overwritten. Do not confuse an unrelated PATH binary with
  the package's reusable native binary. For a newer reusable Shell, the adapter
  must establish native-pin compatibility before presenting this evidence.
- Global-bin observations use `{ available: true, path, writable: true, onPath }`.
  A known missing PATH entry yields an explicit setup intent. Unknown or
  non-writable directories block; no directory is created or permission probed
  by writing. No platform-specific bin path is invented.
- `setup` is a boolean evidence of normal Shell setup readiness. Unknown setup
  on an existing stack blocks; a missing Shell/native binary needs normal setup.

## Reading a plan

Tool statuses distinguish `unavailable`, `unknown`, `incompatible`, `reusable`,
`needs-setup` and `not-required`. Any blocker suppresses all actions: repairing an
existing incompatible or uncertain component requires a later explicit decision,
not automatic replacement. `ready` means no acquisition/setup is indicated by
this inventory, **not that verification has executed**.

A clean target receives these intents in dependency order:

1. Acquire and verify Node, then pnpm; prepare the usable global-bin environment.
2. On Windows, acquire and verify Go before missing native provisioning.
3. Install Pi globally, then `gentle-pi` globally (its existing postinstall owns
   native installation). For an existing Shell with missing native binary, call
   the existing installer instead.
4. Run normal Shell setup and verify stack readiness. Verification is always
   included, even when all components can be reused.

Actions are structured `{ id, kind, target, version? }` descriptors, **not shell
commands**. Later runners must re-inventory after changes, verify prerequisite
versions and global-bin readiness before dependent steps, obtain explicit consent
and stop on mandatory failures. They must preserve existing versions/paths and
use normal global package ownership and default `~/.gentle-shell/agent` semantics.
No alternate product root, Engram database/server, credential migration or custom
companion installer belongs in this plan.

## Remaining boundaries

`npm:` registry sources are package references, not npm executable calls. Pi's
`npmCommand` supports pnpm, but independent upstream `npm exec` control remains
unverified. **This preflight does not establish an npm-free installation chain.**

Downloads, bootstrap scripts, runner, local server, consent UI and native
acceptance evidence are future work in the
[feature plan](../odd/tasks/browser-install-wizard.md). Deterministic injected
inventory tests cover the planning matrix; they do not prove installation on
Windows, macOS or Linux.

Focused verification:

```sh
node --experimental-strip-types --test tests/installer-preflight.test.ts
```
