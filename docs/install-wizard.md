# Installation wizard groundwork

The preflight planner, POSIX bootstrap, Windows prerequisite foundation and the
standard installation runner module are implemented. Windows native validation
remains unavailable locally.
**There is no working browser wizard or complete installation path yet.**
The bootstrap stops explicitly when the future wizard entry is absent.
For ordinary installation and terminal use, follow the [README](../README.md).

## What is available

`scripts/installer-preflight.mjs` exports four small integration surfaces:

| API | Contract |
| --- | --- |
| `requirements` | Repository-derived Node/Pi minima, pnpm acquisition pin, package version, native installer pin and Windows Go minimum. |
| `collectInventory({ platform, arch, probes })` | Calls injected named read-only probes serially. Missing/failed probes become unknown; error text is not retained. |
| `planPreflight(inventory)` | Pure classification and ordered action intents; no commands, downloads, installation or setup execution. |
| `pnpmGlobalBin({ platform, env })` | Pure pnpm 11 global-bin resolution: `{ pnpmHome, path, onPath }` or `null` when unknowable. |

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
  by writing. pnpm 11 places global executables in **`$PNPM_HOME/bin`**, not
  `$PNPM_HOME`, and `pnpm root -g`/`bin -g` fail when that directory is not on
  PATH. Probes must report `pnpmGlobalBin().path`, whose `onPath` compares PATH
  entries with that bin directory. PNPM_HOME is the user's existing absolute
  value; otherwise pnpm's documented default (`$XDG_DATA_HOME/pnpm` or
  `~/.local/share/pnpm` on Linux, `~/Library/pnpm` on macOS,
  `%LOCALAPPDATA%\pnpm` on Windows). A relative PNPM_HOME or missing home is
  unknown, not guessed.
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

Local server, consent UI, distribution packaging and native acceptance evidence
remain future work in the
[feature plan](../odd/tasks/browser-install-wizard.md). Deterministic injected
tests do not prove clean-machine installation on Windows, macOS or Linux.

Focused verification:

```sh
node --experimental-strip-types --test tests/installer-runner.test.ts tests/installer-preflight.test.ts tests/installer-posix-bootstrap.test.ts tests/installer-windows-bootstrap.test.ts
sh -n scripts/bootstrap.sh
```

## Standard installation runner

`scripts/installer-runner.mjs` exports `runStandardInstall({ plan, consent },
adapters)`, the fixed installation step the future wizard host (T5) calls after
bootstrap and a fresh preflight. It is a pure module: every process, filesystem,
environment, integrity and log effect goes through adapters supplied by trusted
local code, never through the browser.

### Request contract

The request is exactly `{ plan, consent }`. `plan` must be an unmodified
`planPreflight` result: every action must equal a descriptor preflight can emit
(same id, kind, target and repository-derived version, no extra keys). Extra
request keys, commands, URLs, roots, environment or altered versions are
rejected as `invalid-request` before any process runs. `consent` must be the
boolean `true`; anything else returns `consent-required` with no commands. The
consent covers the whole displayed plan, including the PATH profile change
below, so the wizard must show that change before asking.

### Adapters

| Adapter | Contract |
| --- | --- |
| `platform` | `linux`, `darwin` or `win32`. |
| `nodePath` | Absolute Node executable of the trusted host, used for npm proof and `gentle-shell setup`. |
| `env` | The user's environment. Never mutated; child environments are copies. |
| `home` | Optional; defaults to `HOME` (`USERPROFILE` on Windows). |
| `run(command, argv, { env, deadlineMs })` | Argv arrays with `shell:false` semantics and a hard deadline; returns `{ code, signal, timedOut, stdout }` with bounded output. |
| `fs` | Read-only `isFile`, `realpath`, `readText`. The runner has no delete or write operation. |
| `verifyGentleAi({ packageRoot, platform, env, home })` | Returns `{ ok: true }` only for package-native integrity. `packageNativeGentleAi` is the default implementation over `runtime/gentle-ai-binary.mjs`. |
| `log({ step, status, reason? })` | Receives step identifiers and statuses only, never raw command output or error text. |

### Fixed sequence

No-process gates, all returning `blocked`:

1. Valid request and explicit consent.
2. Preflight blockers are absent. Only the clean-stack plan is supported: it
   must contain `install-pi`, `install-shell`, `setup-shell` and
   `verify-readiness`, plus optional `setup-global-bin`. Prerequisite acquisition
   intents (Node, pnpm, Go), `provision-native`, partial existing stacks and
   fully reused stacks are `unsupported-plan`.
3. On Windows, Go must be `reusable` in the plan because gentle-pi's postinstall
   may build Gentle AI from source; T4 never acquires Go (`go-required`).
4. `pnpmGlobalBin` resolves PNPM_HOME (`pnpm-home-unknown` otherwise) and
   `nodePath` is absolute.
5. pnpm comes from the bootstrap handoff `GENTLE_INSTALL_PNPM_NODE` +
   `GENTLE_INSTALL_PNPM_ENTRY` (both absolute), or on POSIX from a `pnpm`
   executable on PATH. Windows requires the handoff because a `.cmd` shim cannot
   run with `shell:false` (`pnpm-unavailable`).

Every child process receives the user's environment plus `PNPM_HOME` and
`$PNPM_HOME/bin` first on PATH.

Pre-install checks, returning `blocked` on a false result or adapter error:

1. `check-npm`: Gentle AI's normal Pi install always runs an Engram init step
   that can use `npm exec` and stops on failure. The runner resolves `npm` the
   way Go's `exec.LookPath` (used by Gentle AI) does: absolute child PATH
   directories in order and, on Windows, every child PATHEXT extension in
   PATHEXT order (case-insensitive keys; default `.COM;.EXE;.BAT;.CMD`). That
   first candidate must be the npm package's own `bin/npm-cli.js` (symlink
   target on POSIX; on Windows the candidate must be `npm.cmd`, with
   `node_modules/npm` beside it), its `package.json` must name `npm` with a
   stable version, and `node npm-cli.js --version` must print that version. On
   Windows an `npm.com`, `npm.exe` or `npm.bat` that resolves first, in the
   same or an earlier directory, blocks as `npm-shadowed`; any other mismatch
   blocks as `npm-unavailable`. No npm wrapper is created.
2. `check-global-bin`: `pnpm bin -g` must succeed and equal `$PNPM_HOME/bin`
   (`global-bin-mismatch`; case-insensitive on Windows).
3. `check-existing-stack`: `pnpm list -g --depth 0 --json` runs before any
   mutation. If `@earendil-works/pi-coding-agent` or `gentle-pi` appears in the
   dependencies, devDependencies or optionalDependencies of any listed project,
   the runner blocks as `existing-stack` and never overwrites it, whatever the
   caller's plan says. A failed, timed-out or unparseable listing, or an
   unexpected JSON shape, blocks as `global-list-unavailable`.

Mutating and verification steps, returning `failed` with `failedStep` and the
`completed` step list:

1. `install-global`: exactly one
   `pnpm add -g @earendil-works/pi-coding-agent@1.0.0 gentle-pi@<package version> --allow-build=gentle-pi`.
   Pi is gentle-pi's optional peer, so both resolve in one command. pnpm 11
   silently skips global postinstall scripts by default; the package-scoped
   approval runs only gentle-pi's postinstall, which provisions Gentle AI. No
   blanket build approval is ever passed.
2. `verify-global-list`: `pnpm list -g --depth 0 --json` must report exactly the
   two pinned versions, and gentle-pi's absolute `path` must resolve inside
   PNPM_HOME.
3. `verify-shell-bin`: `$PNPM_HOME/bin/gentle-shell` (`gentle-shell.cmd` on
   Windows) exists.
4. `verify-gentle-ai`: package-native integrity of the installed package. A
   declared development override (`GENTLE_PI_GENTLE_AI_DEV_BINARY` or its
   registration file) is never package-native proof and fails.
5. `shell-setup`: the installed public CLI, `node <gentle-pi>/bin/gentle-shell.mjs
   setup`, with the child environment. Nonzero, signal or deadline fails. The
   runner neither duplicates setup logic nor writes the automatic provisioning
   marker.
6. `persist-path`, only when `$PNPM_HOME/bin` was not on the user's own PATH:
   `pnpm setup`, then the outcome is `terminal-action-required` with
   `action: "open-new-terminal"`. A child environment never proves that a fresh
   terminal resolves `gentle-shell`.

`ready` requires every step above to complete and the global bin to already be
on the user's PATH. Skipped, unverified or failed mandatory steps never yield
`ready`, and no existing installation, home or data is deleted on any outcome.
Deadlines are 30 seconds for probes and `pnpm setup` and 20 minutes each for
the install and setup steps.

### Remaining T7 real-machine checks

The runner is verified only with deterministic fake adapters. Observed pnpm
11.1.1 facts come from one Linux laboratory run. Before claiming support, T7
must establish on real Windows, macOS and Linux machines:

- `pnpm list -g --json` reports a dependency `path` that resolves inside
  PNPM_HOME for the installed layout, and prints a parseable JSON array (for
  example `[]`) when no global package exists yet; empty output would block
  a clean installation as `global-list-unavailable`;
- Windows npm resolution matches Gentle AI's actual lookup, including its
  current-directory handling;
- the scoped `--allow-build=gentle-pi` postinstall provisions package-native
  Gentle AI, including Windows source builds with the user's Go;
- `gentle-shell setup` completes the Engram init step with genuine npm, and
  whether Gentle AI selects `pnpm dlx` or `npm exec`;
- `pnpm setup` makes `gentle-shell` resolvable in a fresh terminal of each
  supported shell (the Linux lab showed it does not make `pnpm` itself
  resolvable);
- the chosen deadlines suffice on slow networks, and pnpm's registry and
  update-notice traffic is acceptable;
- interrupted installs are recoverable by rerunning the wizard without data loss.

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

POSIX/pnpm integrity values live in `installer-downloads.mjs`; Windows Node
values live in `installer-windows-artifacts.json`. The shell copies
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
acquired }`, leaving the supplied environment unchanged. The Windows adapter reuses descriptors/integrity verification without changing
POSIX process semantics, defaults or pins.

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

## Windows foundation: fixed commands, no policy repair

Run `scripts\bootstrap.cmd` from a trusted extracted bundle or checkout. Like
POSIX, it stops before acquisition or home writes when T5's entry or any
Windows-dependent helper/metadata file is missing. There is no published bundle
URL, remote-pipe contract or working installation wizard yet.

| Step | Windows contract |
| --- | --- |
| Entry | Small CMD entry invokes fixed stock Windows PowerShell commands with no profile. Paths are environment data, not interpolated PowerShell source. Delayed CMD expansion is disabled. |
| Storage | Claim a new random-named prerequisite directory below LOCALAPPDATA, never reuse an existing destination. Verify each path component's reparse attributes, owner and role-specific ACL rights. Protect the claimed directory's DACL for the invoking SID, SYSTEM and Administrators, and read it back. |
| Node | Reuse a proven stable existing Node ≥24.3.0 and the repository minimum. Otherwise acquire only the fixed official Node 24.21.0 Windows x64/arm64 ZIP, with no redirects and bounded transport, verify SHA256 before opening the archive, validate the whole namespace and extract only regular `node.exe`. |
| pnpm | Reuse only a fully recognized npm CMD shim with package identity, bin target, stable CLI version, compatible engine and global add/bin help evidence. Preserve its sibling-Node preference or prove its inherited cwd/PATH/PATHEXT Node selection. Never execute the shim via cmd.exe. Unknown wrappers block without replacement. |
| Missing pnpm | Shared pnpm 11.1.1 URL/SRI and raw `>=22.13` engine identity are unchanged. Parse bounded gzip/USTAR bytes, reject unsupported extensions, links and unsafe Windows namespaces before no-clobber publication. Return a direct Node + JS-entry invocation; do not fabricate a wrapper. |
| Handoff | Existing Node helper starts the fixed future `bin/gentle-shell-install.mjs`. Only child PATH is refreshed. No persistent PATH, global installation, product root or companion installation is created here. |

Windows Node SHA256 provenance is the parent's fresh primary-source read of
[24.21.0 SHASUMS256](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt). A narrow
JSON metadata file lets pre-Node PowerShell and the shared Node helper consume
the same Windows pins without mixing the POSIX archive format or copying pnpm
integrity into another runtime. Pin changes still require fresh primary evidence.

### T4/T5 integration contract

`scripts/installer-windows.mjs` exports:

- `ensureWindowsPnpm({ tools, env, node?, adapters? })` → `{ acquired, env,
  command, prefix }`. Invoke `[command, ...prefix, ...args]` with `shell:false`;
  keep the returned environment. `tools` must be a private attempt-owned root.
  Test adapters are trusted local code only, never a browser API.
- `bootstrapWindows({ bundle, tools, env })` validates fixed bundle files and
  requirements, acquires/reuses pnpm, then delegates to shared `launchWizard`.
  CLI entry is `installer-downloads.mjs --bootstrap-windows BUNDLE TOOLS`.
- T5 receives `GENTLE_INSTALL_PNPM_NODE` and `GENTLE_INSTALL_PNPM_ENTRY` as data
  for that proven direct invocation. T4 must re-inventory before installation;
  these values are not an arbitrary command API or persistent terminal repair.
- Storage, namespace, wrapper, tar and bounded process functions are exported
  for focused verification. Production storage verification requires native
  Windows and fixed stock PowerShell ACL commands, never POSIX mode/UID evidence.

Go preparation is deliberately **not implemented or invoked** in this unit.
The standard installation runner blocks on Windows unless preflight reports a
reusable Go ≥1.25.10, because gentle-pi's postinstall may build Gentle AI from
source; it never acquires Go or treats an explicit override as native-package
evidence.

### Policy, bounds and evidence limits

No unsigned `.ps1` file, script-file evaluation, execution-policy relaxation,
file unblocking, certificate/TLS bypass, elevation, security exclusion or profile
change is used. Restricted permits individual commands; it is not every Windows
client's default. [Execution policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)
do not override [AppLocker CMD/BAT rules](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/script-rules-in-applocker)
or [managed App Control constraints](https://learn.microsoft.com/en-us/powershell/scripting/security/app-control/how-app-control-works).
ConstrainedLanguage and any download/execution denial stop with an error. There
is no fallback intended to evade those controls; if CMD itself is denied, the
OS owns the denial diagnostic before our entry can run.

Node transport is capped at 100 MiB with a 60-second request/total elapsed check
and 10-second blocking-read timeout. A blocking read can consume up to that last
read timeout beyond the elapsed check. ZIP metadata caps expanded size at 512 MiB
and the selected executable at 150 MiB. Namespace checks reject traversal,
backslashes, links/reparse attributes, duplicate/case-aliased names, conflicting
file/directory parents, devices, ADS and trailing dots/spaces. Shared pnpm
transport remains 32 MiB/60 seconds; tar expansion is capped at 128 MiB.
Unsupported archive extensions fail closed. **Actual pnpm 11.1.1 TGZ acceptance
is unproved:** it requires an integrity-backed offline copy of the pinned
artifact, not a synthetic USTAR fixture or an injected digest. No such evidence
was supplied and no acquisition is authorized in this correction.

The pre-Node probe drains both pipes with a combined 1-MiB cap and kills only
its direct child at 10 seconds, with a bounded one-second final wait. Node helper
probes use the shared 15-second/1-MiB-style bounds and an unignorable direct-child
kill. Valid output followed by a hang is a failure. Production never kills
process groups or unrelated processes. Forked descendants retaining stdio are
outside the guarantee; the interactive wizard has no total deadline.

### Target-versus-ancestor ACL boundary

For untrusted SIDs, the fixed predicates allow ReadAndExecute plus Synchronize
(`0x1200a9`), with one narrow directory-specific distinction:

| Role | Mutation boundary |
| --- | --- |
| Actual file/executable or owned tooling root (depth 0) | No write, deletion, child-deletion, ACL or ownership rights. |
| Immediate parent (depth 1) | Same strict protection, including no CreateDirectories/AppendData. A new tooling claim starts checking its parent at this depth. |
| Distant **existing directory** (depth ≥2) | May additionally allow CreateDirectories/AppendData (`4`) for sibling-only creation. WriteData/CreateFiles, WriteExtendedAttributes, WriteAttributes, Delete, DeleteSubdirectoriesAndFiles, WriteDACL, TakeOwnership, generic/unknown rights still reject. |

Directory CreateDirectories and file AppendData share an enum bit; a distant
ancestor here must actually be an existing directory. This is not permission to
append to an executable. Reparse checks, trusted ownership and every actual path
component remain mandatory. An inheritable ACE is checked again where it becomes
effective on the descendant; InheritOnly does not grant rights on its current
object. Effective unsafe allow ACEs block even when deny ACEs might otherwise
limit them: this is a conservative mutation boundary, not a general Windows
ACL/access-check framework. Trusted SIDs and protected-DACL readback are unchanged.
The portable fixture model checks parity with all three fixed production
predicates; it does not execute Windows ACL APIs or claim prevalence on Windows.

Failure cleanup targets only the directory claimed by the actual attempt;
collisions and unrelated storage are not removed. Successful prerequisite tools
remain available to children. ACL/ancestor checks are conservative and may
reject managed/nonstandard layouts rather than relax security. They do not
claim protection from a malicious process running as the same principal or an
administrator, nor eliminate same-principal time-of-check/time-of-use races.

### Implemented fixtures versus missing execution evidence

The native gates now contain runnable assertions, not empty or always-skipped
callbacks. They run on Windows without a pending-fixture override:

- Actual production claim/check predicates: protected-root creation, collision
  preservation, harmless distant sibling creation, dangerous-right refusal,
  strict target/immediate-parent checks and junction rejection. Junction creation
  alone can be capability-skipped after an actual permission/unsupported error.
  DACL changes are limited to new disposable fixture-owned objects.
- Actual fixed PowerShell ZIP namespace/publication stage: local ZIPs with the
  fixed archive/member identity; valid publication and traversal, aliases,
  symlink/reparse attributes, ADS, devices, trailing names and parent conflicts.
  The valid member contains the available fixture Node's unchanged bytes and is
  never executed. Collision tests preserve unrelated published storage.
- Actual pre-Node process primitive: approved Node executes local fixture JS;
  nonzero exit, both output limits, quiet/stdout/stderr/both-pipe hangs and valid
  output followed by a hang are rejected. Production drain/deadline/validation/
  cleanup lines are unchanged. An independent hard guard checks recorded process
  creation ticks and only kills fresh fixture-owned handles. A guard firing or
  finding a residual recorded child is a test failure, not successful deadline
  evidence; fixture cleanup cannot mask a missing production reap.
- Complete local sentinel composition exercises CMD continuation/quoting,
  bundle checks, claim, existing-Node resolution/probe, real helper pnpm handoff
  and late cleanup with spaces, Unicode and CMD metacharacters. Only the approved
  available Node's unchanged bytes are cloned into the disposable fixture PATH,
  excluding operator npm/Corepack/pnpm shims. A local JS pnpm fixture provides
  read-only identity/help responses. The trusted fixture helper copy has a fixed,
  fail-only fetch guard: accidental acquisition throws before any network call;
  it never supplies bytes/digests or adds a production integrity-bypass switch.
  No network/install occurs.

The fixtures preserve the exact production command lines and insert only
fixture-owned process observations. They compose primitives in a disposable
`.cmd`, not a loaded/evaluated PowerShell script file. Native AppLocker and
ConstrainedLanguage denials still apply, with no policy relaxation. This is
**stage/composition evidence, not uninstrumented whole-entry certification**:
transport/integrity gates and the real pinned artifacts require separate proof.
The original missing-entry test also exercises the unchanged whole entry.

All these native fixtures are **implemented but unrun on this Linux host**:
Windows PowerShell and a Windows runner are unavailable. Portable descriptor,
ACL-predicate model, tar, wrapper and process fixtures are not native Windows
proof. Native OS/ACL/CMD/loader acceptance remains T7 evidence work; the actual
pinned pnpm TGZ offline acceptance remains an explicitly unfinished evidence
item. No live artifact was downloaded/executed, operator-home installation
performed, operator/global ACL or policy changed, or Windows OS minimum/support
claimed. No same-principal-adversary or forked-descendant guarantee is made.
T7 must establish those facts before advertising clean-machine support.
