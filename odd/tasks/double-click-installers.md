# Double-click installers (unsigned)

Objective: a person who does not use a terminal downloads one file, double-clicks it, and the installation wizard opens and runs.
Branch: `feat/double-click-installers` (from `main` be2869b7b). Delivery: single PR. Test runner: `node --experimental-strip-types --test <files>`; suite `pnpm test`.

## Specs

- S1. "como un ejecutor clásico de computadora para una persona que no sabe. Bien, entonces vos entrás, le das un doble clic, se abre el instalador y hace los pasos": one downloadable file per system whose double-click starts the existing bootstrap and wizard, with no git, clone or typed command — macOS (`.command`), Windows (`.cmd`), Linux (`.sh`).
- S2. "sin firma": the downloads are unsigned; no code-signing or notarization.
- S3. "indicando esto que me dices en el readme": the README explains the download and the operating-system warnings an unsigned file triggers and how to continue past them (macOS Gatekeeper "Open Anyway", Windows SmartScreen "More info → Run anyway", extracting the zip first).
- S4 (assumption, needed by S1): every release gets the installers attached with stable names, so a "latest" download link always points at the newest release, plus SHA-256 checksums.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1, S2, S4 (bundle builder: wizard files + launchers per OS, archives, checksums) | inline | pending | |
| T2 | S4 (publish.yml: attach the installers to the release after the verified publication) | inline | pending | |
| T3 | S3 (README download section with unsigned warnings; install-wizard doc) | inline | pending | |

Route evidence: no Writer trigger (sequential, shared bundle layout). Risk: item 5 (release workflow) → independent verifier unless the native assessment says otherwise.

## Log

- L1 (2026-10-09, user): "Cuéntame ahora cómo aparece en el readme todo el tema de la instalación fácil con el web. Bien, porque de vuelta, esto necesito que sea como un ejecutor clásico de computadora para una persona que no sabe. Bien, entonces vos entrás, le das un doble clic, se abre el instalador y hace los pasos. Esa es la idea."
- L2 (2026-10-09, user decision): "sin firma, indicando esto que me dices en el readme"
- L3 (evidence): README Path C requires `git clone` and a terminal command. `publish.yml` only publishes npm; the GitHub release is created before it runs (gentle-pi-release skill). The wizard imports only `node:` modules, so a bundle needs no dependencies.
