# Contributing to AuraMail

Thank you for your interest in contributing to AuraMail! This document outlines how to set up your local development environment, coding conventions, and the pull request workflow.

---

## Before You Begin

- Please review [ARCHITECTURE.md](./ARCHITECTURE.md) — it explains the Electron process model, IPC contract, synchronization engine, and SQLite schema.
- AuraMail supports **Windows 10/11** and **Linux** (Ubuntu, Debian, Fedora, Arch Linux, etc.). Please ensure any code changes maintain cross-platform compatibility and keep native dependencies portable.

---

## Prerequisites & Environment

- **Node.js 24.x** (LTS recommended).
- **Git**.
- **C/C++ Build Environment & Secret Service**:
  - **Windows**: Windows 10/11 with **Visual Studio Build Tools** ("Desktop development with C++" workload enabled) — required to compile native C++ addons (`better-sqlite3-multiple-ciphers` and `keytar`).
  - **Linux**: Standard build tools and `libsecret` development headers:
    - **Debian / Ubuntu / Mint / Pop!_OS**: `sudo apt install build-essential libsecret-1-dev python3`
    - **Fedora / RHEL**: `sudo dnf install make gcc-c++ libsecret-devel python3`
    - **Arch Linux / Manjaro**: `sudo pacman -S base-devel libsecret python`

---

## Setup & First Run

```bash
git clone <your-fork-url>
cd auramail
npm install
npm run setup
npm run dev

# (Linux Wayland optional)
npm run dev -- --ozone-platform-hint=auto
```

### Native Modules Compilation

AuraMail relies on two native C++ addons that must be compiled against the **Electron ABI** rather than the host Node.js runtime: `better-sqlite3-multiple-ciphers` and `keytar`. `npm run setup` automatically handles this across platforms via `scripts/rebuild-native.mjs`:

1. **Windows**: The official Node.js 24 Windows distribution is built using ClangCL. `scripts/rebuild-native.mjs` automatically inspects generated `.vcxproj` files and removes conflicting `/LTCG:INCREMENTAL` flags to guarantee a clean MSBuild compilation.
2. **Linux**: Uses standard GNU `make` and `gcc`/`g++` through `node-gyp`. Native secret storage links dynamically against `libsecret-1`.
3. **Electron Binary Download**: `scripts/install-electron.mjs` provides a reliable multi-platform downloader ensuring Electron is properly unpacked with executable permissions set on POSIX systems.

If you update Node.js or Electron and encounter `NODE_MODULE_VERSION` mismatch errors on startup, simply re-run:
```bash
npm run setup
```

---

## Available npm Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the app in development mode with Hot Module Replacement (HMR) for the renderer. |
| `npm run typecheck` | Runs TypeScript type checking for `main`, `preload`, and `renderer`. |
| `npm test` | Runs the Vitest test suite (unit and integration tests). |
| `npm run lint` | Runs ESLint across all `.ts` and `.tsx` source files. |
| `npm run build` | Compiles production bundles for main, preload, and renderer. |
| `npm run build:win` | Builds production artifacts and generates the NSIS Windows installer. |
| `npm run build:linux` | Packages Linux distributions (standalone AppImage, Debian `.deb`, and Fedora/RPM `.rpm`). |
| `npm run build:all` | Packages release installers for all target desktop platforms. |

---

## Code Conventions

- **Strict TypeScript Everywhere**: `strict: true` is enforced across all `tsconfig.*.json` configurations. Avoid `any` types or suppressing compiler checks without strong justification.
- **IPC Invariants**: The renderer must never call `ipcRenderer.invoke` directly and never receives `nodeIntegration`. Any new cross-boundary capability must follow: `src/shared/ipc.ts` (contract) → `src/main/ipc/index.ts` (Zod validation & handler) → `src/preload/index.ts` (context bridge method).
- **Append-Only Database Migrations**: Schema alterations must always be added as a new migration item in the `MIGRATIONS` array in `src/main/database/schema.ts` with an incremented version number. Never modify an existing migration.
- **Credential Storage**: Account passwords and auth tokens must never enter the SQLite database or application logs. All sensitive secrets must go through `src/main/security/secrets.ts` (Windows Credential Manager).
- **Internationalization (i18n)**: All UI strings, notifications, and menus must be defined in both `src/renderer/src/i18n/locales/pl.ts` and `src/renderer/src/i18n/locales/en.ts`. No hardcoded strings in components.
- **Security Boundaries**: Never disable `contextIsolation`, `sandbox`, or `webSecurity` on any window.

---

## Submitting Pull Requests

1. Fork the repository and create a feature branch (`git checkout -b feat/my-feature`).
2. Verify all quality checks pass locally:
   ```bash
   npm run typecheck && npm test && npm run lint
   ```
3. Clearly describe what changes were made, why, and whether database migrations or IPC contracts were touched.
4. Security-sensitive changes (credentials, CSP, sandboxing, encryption) will receive thorough scrutiny.

---

## Reporting Issues & Vulnerabilities

- For standard bugs, open a GitHub Issue with reproduction steps, Windows version, Node.js version, and relevant logs (`%APPDATA%/auramail/logs/`).
- For security vulnerabilities, please refer to [SECURITY.md](./SECURITY.md). Do not open public issues for security vulnerabilities.
