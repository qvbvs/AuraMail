<div align="center">

# AuraMail

**A private, local-first email client for the desktop.**

[![Release](https://img.shields.io/github/v/release/qvbvs/auramail?style=flat-square&color=6366f1)](https://github.com/qvbvs/auramail/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-333333?style=flat-square)](#installation)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](./LICENSE)

</div>

<br>

<p align="center">
  <img src="./docs/screenshots/screenshot-dark.png" width="100%" alt="AuraMail" />
</p>

---

## About

AuraMail is a native email client for Windows and Linux, built around **privacy, performance, and productivity**. Your mail lives locally — encrypted, searchable offline, and free of any unnecessary cloud layer.

Built with **Electron**, **React**, **TypeScript**, and **SQLCipher**.

## Features

- **Encrypted by default** — SQLCipher (AES‑256) database, credentials stored via the OS keychain (DPAPI / Secret Service / KWallet)
- **Real-time sync** — IMAP IDLE push, automatic reconnect, sleep/wake recovery
- **Offline search** — full-text search across your mailbox via SQLite FTS5
- **Rich composer** — Tiptap editor with checklists, code blocks, send later, and snooze
- **One workspace** — integrated calendar, contact timeline, thread notes, automation rules
- **Keyboard-first** — global command palette (`Ctrl K`) and full keyboard navigation
- **Multi-account** — unified inbox, each account with its own identity and color
- **Multilingual** — English and Polish interface

## Preview

<p align="center">
  <img src="./docs/screenshots/screenshot-thread.png" width="32%" alt="Thread view" />
  <img src="./docs/screenshots/screenshot-compose.png" width="32%" alt="Composer" />
  <img src="./docs/screenshots/screenshot-calendar.png" width="32%" alt="Calendar" />
</p>

## Architecture

Isolated Electron processes connected by a secure IPC boundary.

```
Renderer  (React · Fluent UI · Tailwind · Zustand)
    │
  secure IPC
    │
Main process  (Mail · SMTP · Sync · Calendar · Scheduler)
    │
 ┌──┴───────┐
 SQLCipher   OS Keychain
```

<sub>Full breakdown in <a href="./ARCHITECTURE.md">ARCHITECTURE.md</a>.</sub>

## Tech stack

|  |  |
|---|---|
| Desktop | Electron 33 |
| Language | TypeScript 5 |
| UI | React 18 · Fluent UI · Tailwind CSS |
| Mail | IMAPFlow · Nodemailer · MailParser |
| Storage | SQLite + SQLCipher · FTS5 |
| Editor | Tiptap |
| State | Zustand |
| Credentials | Keytar · Electron `safeStorage` |
| Testing | Vitest · Playwright |

## Installation

**Requirements:** Node.js 24+, Git, C/C++ build tools (plus `libsecret` dev headers on Linux)

```bash
git clone https://github.com/qvbvs/auramail.git
cd auramail
npm install
npm run setup   # rebuilds native modules for Electron's ABI
npm run dev
```

On Wayland: `npm run dev -- --ozone-platform-hint=auto`

<details>
<summary>Linux dependencies</summary>
<br>

```bash
# Debian / Ubuntu / Mint / Pop!_OS
sudo apt install build-essential libsecret-1-dev python3

# Fedora / RHEL
sudo dnf install make gcc-c++ libsecret-devel python3

# Arch / Manjaro
sudo pacman -S base-devel libsecret python
```

Tested on GNOME, KDE Plasma, XFCE and Cinnamon, under both X11 and Wayland.

</details>

## Security

- Mail data is stored in a local **SQLCipher-encrypted** SQLite database (AES-256)
- The encryption key is protected per-install via Electron's `safeStorage` (Windows DPAPI / Linux Secret Service)
- Account credentials live in the OS credential manager via `keytar` — never in the app database
- Hardened Electron: `contextIsolation`, `sandbox`, no `nodeIntegration`; external links open in the system browser

Found a vulnerability? See [SECURITY.md](./SECURITY.md).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl K` | Command palette |
| `C` | New message |
| `Ctrl Enter` | Send |
| `E` | Archive |
| `S` | Star / unstar |
| `Delete` | Move to trash |
| `Esc` | Close active view |

## Build

```bash
npm run typecheck   # type checking
npm test            # tests
npm run lint        # lint

npm run build:win     # Windows
npm run build:linux   # Linux
npm run build:all     # all platforms
```

Artifacts land in `dist/` — `.exe`/NSIS on Windows, `.AppImage`/`.deb`/`.rpm` on Linux.

## Roadmap

- [ ] Advanced automation rules
- [ ] Additional calendar integrations
- [ ] Improved contact management
- [ ] More customization options
- [ ] Extended keyboard workflows

## Contributing

Contributions and bug reports are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

---

<div align="center">
<sub>MIT © 2026 qvbvs · <a href="https://github.com/qvbvs/auramail">GitHub</a> · <a href="https://github.com/qvbvs/auramail/releases">Releases</a></sub>
</div>
