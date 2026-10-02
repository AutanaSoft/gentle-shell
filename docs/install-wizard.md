# Installation wizard groundwork

The preflight planner and POSIX prerequisite bootstrap are implemented.
**There is no working browser wizard or complete installation path yet.**
The bootstrap stops explicitly when the future wizard entry is absent.
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

Windows bootstrap, standard installation driver, local server, consent UI,
distribution packaging and native acceptance evidence remain future work in the
[feature plan](../odd/tasks/browser-install-wizard.md). Deterministic injected
tests do not prove clean-machine installation on Windows, macOS or Linux.

Focused verification:

```sh
node --experimental-strip-types --test tests/installer-preflight.test.ts tests/installer-posix-bootstrap.test.ts
sh -n scripts/bootstrap.sh
```

## POSIX bootstrap: bundle-local tooling only

Run `sh scripts/bootstrap.sh` from a trusted extracted installation bundle or
checkout. There is **no published bundle URL or remote-pipe installer contract**.
The bundle must include `package.json`, both bootstrap modules and the future
`bin/gentle-shell-install.mjs` (T5). Today that entry is absent: the script reports
it before downloads or home writes. T7 owns packaging and distribution proof.

With that entry available, the fixed sequence is:

1. Probe existing Node against the bundle's repository requirement. Unknown,
   prerelease or incompatible versions block; they are never replaced.
2. If missing, select a fixed native Node archive, download with TLS and bounded
   size/time, verify its hardcoded SHA256 using stock shell utilities, extract
   only its regular `bin/node`, and check the exact executable version before
   publishing it. Neither npm nor Corepack is acquired or invoked.
3. Reuse pnpm only after stable version, package engine and read-only global
   `add`/`bin` help-capability evidence. Engines support only simple `>=x.y` or
   `>=x.y.z` lower bounds; comparison fills an omitted patch with zero. Actual
   Node versions must remain exact stable versions; other ranges block rather
   than guess.
   Missing pnpm is acquired from a fixed registry tarball, SHA512-SRI verified,
   checked for unsafe paths/links, extracted and probed before publication.
4. Start the fixed bundle entry with the refreshed child environment. A mandatory
   acquisition/probe/child failure is an error, never installation success.

### Ownership and failure boundaries

Acquisition uses a mode-0700, uniquely created
`$HOME/.gentle-shell-bootstrap-tools.<random>` directory, with an explicit
`.bootstrap-owned` marker. This is **prerequisite tooling, not a product home**.
HOME must be absolute, owned by the current user, not group/world writable and
free of symlink ancestors. Staging and destinations reject conflicts and
symlinks. Unrelated similarly named directories are not scanned, reused or
removed. Failed attempts clean only their own private directories; successful
acquisition removes its temporary archives/staging and retains verified tools
so child processes can continue using them.
A new attempt reuses tools only if already visible and proven on its PATH; it
does not discover or garbage-collect previous private attempts.

No profile, global PATH, existing executable installation, product agent home,
Engram state or companion installation is changed. Added paths affect only the
bootstrap and its child. T4 must implement standard global installation and the
persistent **ordinary terminal** handoff; these private wrappers are not that
handoff. Existing unverifiable pnpm wrappers/binaries block instead of being
silently replaced. No sudo or security exclusions are requested.

Stock utilities are prerequisites, not silently installed: POSIX sh, awk,
dirname, uname, mkdir, mktemp, chmod, mv, rm, sleep, wc, id and ls; missing Node
also needs curl, tar and sha256sum or shasum. Linux acquisition additionally
requires getconf evidence of glibc >=2.28. Missing pnpm requires tar. Missing
utilities are reported. Shell executable-version probes have a 10-second
watchdog, hash/archive probes 30 seconds; curl has a 10-second connection and
120-second total limit with a 100-MiB artifact cap. A subprocess-only `ulimit -f`
adds a hard disk ceiling (at most 200 MiB depending on shell block units) for
older curl implementations; failure to establish it blocks acquisition.
The JavaScript transport rejects
redirects, caps pnpm at 32 MiB and aborts after 60 seconds; process checks have
15-second/1-MiB bounds. At a prerequisite-process deadline, the shell watchdog
and Node process adapter send SIGKILL to their directly spawned child, rather
than catchable SIGTERM. A killed probe is a failure even if it printed valid
output before hanging. Shell watchdog cancellation also kills and waits for its
owned sleeper. The interactive wizard child intentionally has no total runtime
timeout. Raw downloader/process error text is not logged.

### Artifact trust and shared helper API

| Artifact | Acquisition pin and provenance |
| --- | --- |
| Node native darwin/linux x64/arm64 | 24.21.0; parent-verified SHA256 entries from [official SHASUMS256](https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt), applied to fixed [v24.21.0 archive URLs](https://nodejs.org/dist/v24.21.0/). |
| pnpm JavaScript CLI | 11.1.1; parent-verified raw engine `>=22.13` (comparison minimum `22.13.0`), tarball and SHA512 SRI from [registry version metadata](https://registry.npmjs.org/pnpm/11.1.1); [fixed tarball](https://registry.npmjs.org/pnpm/-/pnpm-11.1.1.tgz). |

The exact integrity values live in `installer-downloads.mjs`; the shell copies
only Node's acquisition pin/hashes because first acquisition cannot depend on
Node. Tests cross-check shell selection against the shared descriptors. Changing
these pins requires renewed primary-source integrity evidence and updating both
Node representations together. There is no live latest resolution. The pnpm pin retains the exact raw upstream
engine string for metadata identity checks; only version comparisons normalize
its supported partial minimum. Product versions/minima remain repository-derived;
the pnpm pin is not a compatibility
minimum. Registry-hosted artifacts do not imply using the npm executable.

`scripts/installer-downloads.mjs` exports `artifactFor(name, platform, arch)`
(frozen allowlisted descriptors), `verifiedDownload(name, adapters, platform,
arch)` (verified bytes), `compatibleEngine(range, version)`,
`ensurePnpm({ tools, env, nodeVersion, adapters })` and
`launchWizard({ bundle, env })`. Only known artifact names are accepted, not
caller URLs/checksums/commands. Trusted local test adapters inject byte download,
digest and process checks; they are not exposed through any browser interface.
The caller owns a private `tools` directory. `ensurePnpm` returns `{ env,
acquired }`, leaving the supplied environment unchanged. Future T3 can reuse
descriptors/integrity verification; Windows descriptors, process semantics and
wrapper publication are intentionally not implemented by this POSIX unit.

### Evidence, not platform certification

Native shell execution was exercised on this Linux host with disposable Unicode
and whitespace paths, fake OS/download/hash/archive utilities and injected
JavaScript acquisition/process adapters. No real network or host prerequisite
installation was performed. Darwin selections are simulated, **not native
macOS execution**. Native macOS, Linux clean-machine/loader and minimum macOS
version acceptance remain T7 work. Linux acquisition is native glibc-only:
musl/Alpine and emulation/Rosetta compatibility are not claimed. Node's
[upstream build/platform requirements](https://github.com/nodejs/node/blob/v24.21.0/BUILDING.md)
remain the platform reference; successful descriptor planning alone proves no
OS/kernel/libc support.

### Subprocess deadline evidence

The regression fixtures exercise production process paths without shortened
production timeouts or a mocked process adapter:

| Path | Observed Linux fixture behavior |
| --- | --- |
| Shell acquired-Node version probe | A single Node process prints the expected version, ignores TERM and waits without busy-looping. The real 10-second watchdog kills/reaps it, rejects acquisition and removes owned tooling while preserving an unrelated HOME file. |
| Node helper tar probe | Fake verified bytes feed `ensurePnpm`, but its default process adapter runs a real single-process TERM-ignoring tar stand-in. The real 15-second deadline kills/reaps it, rejects acquisition and removes owned staging while preserving an unrelated file. Ordinary nonzero tar exit also rejects and cleans staging. |

Before correction, both paths exceeded their deadlines and needed the test
harness's independent outer SIGKILL guard (13 seconds for shell, 18 for Node).
The guard kills only each freshly created detached fixture group and also
cleans residual fixture processes on exit. Production does **not** kill groups,
match process names or use an external timeout utility. After correction, both
probe PIDs are reaped before their parents return; neither outer guard fires.
Ordinary success remains covered by the existing reuse/acquisition tests.

These are **direct-child, non-forking probe** guarantees, not process-tree
cancellation evidence. Unknown programs that fork descendants retaining stdio
may keep pipes open; this unit does not claim bounded return or descendant
cleanup for those programs. The fixtures prove neither native macOS behavior
nor live artifact acquisition. Independent verification and native review remain
separate parent-owned gates.
