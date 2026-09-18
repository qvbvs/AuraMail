<div align="center">

# ⚡ AuraMail

### A private, modern email client built for desktop.

Fast. Secure. Local-first.

Built with **Electron**, **React**, **TypeScript** and **SQLCipher** for a modern desktop email experience without sacrificing privacy.

<br />

[![Version](https://img.shields.io/badge/version-0.1.0-6366f1?style=for-the-badge)](https://github.com/qvbvs/auramail/releases)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D6?style=for-the-badge\&logo=windows\&logoColor=white)](https://github.com/qvbvs/auramail)
[![Linux](https://img.shields.io/badge/Linux-supported-FCC624?style=for-the-badge\&logo=linux\&logoColor=black)](https://github.com/qvbvs/auramail)
[![Node](https://img.shields.io/badge/Node.js-24%2B-339933?style=for-the-badge\&logo=node.js\&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=for-the-badge)](./LICENSE)

<br />

**[Features](#-features)** · **[Preview](#-preview)** · **[Architecture](#-architecture)** · **[Tech Stack](#-technology-stack)** · **[Installation](#-installation)** · **[Security](#-security)**

</div>

<br />

---

## ✦ What is AuraMail?

AuraMail is a **native desktop email client for Windows and Linux** designed around three principles:

**Privacy · Performance · Productivity**

Instead of treating your mailbox as a cloud-only interface, AuraMail keeps your data and search capabilities available locally while using modern desktop security mechanisms to protect sensitive information.

No unnecessary cloud layer.
No browser tab.
No compromise between usability and privacy.

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🔐 Privacy by Design

Your mailbox stays under your control.

* SQLCipher encrypted local database
* AES-256 database encryption
* OS-backed credential storage
* Windows DPAPI support
* Linux Secret Service / Keyring support
* No account passwords stored in SQLite
* Secure Electron process isolation
* Strict Content Security Policy

</td>
<td width="50%" valign="top">

### ⚡ Real-Time Email

Messages arrive when they arrive.

* IMAP IDLE push
* Automatic connection recovery
* Exponential backoff with jitter
* Sleep / wake recovery
* Multi-account inbox
* Thread grouping
* Offline search with SQLite FTS5

</td>
</tr>

<tr>
<td width="50%" valign="top">

### ✍️ Powerful Composer

A modern writing experience for everyday email.

* Rich text editing
* Tiptap-powered composer
* Links and formatting
* Checklists
* Code blocks
* Attachments
* Send Later
* Snooze
* Follow-up reminders

</td>
<td width="50%" valign="top">

### 📅 One Workspace

Everything you need in one desktop application.

* Integrated calendar
* Contact timeline
* Thread dossiers
* CRM notes
* Automation rules
* Custom labels
* Global command palette
* System tray integration
* Polish / English interface

</td>
</tr>
</table>

---

# 🖼️ Preview

<div align="center">

### AuraMail — Dark & Light

<img src="./docs/screenshots/screenshot-dark.png" width="49%" alt="AuraMail Dark Mode" />
<img src="./docs/screenshots/screenshot-light.png" width="49%" alt="AuraMail Light Mode" />

<br /><br />

### Designed for Real Work

<img src="./docs/screenshots/screenshot-thread.png" width="32%" alt="AuraMail Thread View" />
<img src="./docs/screenshots/screenshot-compose.png" width="32%" alt="AuraMail Composer" />
<img src="./docs/screenshots/screenshot-calendar.png" width="32%" alt="AuraMail Calendar" />

</div>

---

# 🧩 Core Experience

### 📥 Unified Inbox

Connect multiple IMAP accounts and manage them from a single interface.

Each account can have its own identity, folders and visual color while messages remain organized in one unified workspace.

### 🔎 Instant Offline Search

Search your mailbox even when you're offline.

AuraMail uses **SQLite FTS5** to index subjects, senders and message bodies locally, providing fast search without sending your queries to an external service.

### 🧵 Thread Dossiers

Turn conversations into contextual workspaces.

View correspondence history, contact information, response patterns and internal notes without losing the context of the conversation.

### ⌨️ Keyboard-First Workflow

Power users can navigate the application without constantly reaching for the mouse.

Use:

`Ctrl + K`

to open the global command palette and quickly jump between accounts, folders, searches and actions.

---

# 🏗️ Architecture

AuraMail is split into isolated Electron processes with a secure IPC boundary.

```text
┌─────────────────────────────────────────────────────┐
│                    AuraMail                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Renderer                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │ React 18 · Fluent UI · Tailwind · Zustand    │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                           │
│                    Secure IPC                       │
│                          │                           │
│  ┌───────────────────────▼───────────────────────┐  │
│  │ Electron Main Process                         │  │
│  │                                               │  │
│  │ Mail · SMTP · Sync · Calendar · Scheduler    │  │
│  │ Database · Security · Tray · Settings        │  │
│  └───────────────┬───────────────────┬───────────┘  │
│                  │                   │              │
│          ┌───────▼───────┐   ┌──────▼─────────┐    │
│          │   SQLCipher   │   │   OS Keychain  │    │
│          │   SQLite      │   │                │    │
│          └───────────────┘   └────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Project Structure

```text
src/
├── main/
│   ├── mail/          # IMAP, IDLE, sync, threading, rules
│   ├── smtp/          # Outgoing email
│   ├── database/      # SQLCipher + migrations
│   ├── security/      # Encryption + credential storage
│   ├── calendar/      # Calendar repository
│   ├── scheduler/     # Send Later, snooze, follow-ups
│   ├── settings/      # Application settings
│   ├── tray/          # System tray
│   └── ipc/            # Secure IPC handlers
│
├── preload/
│   └── ...             # Secure context bridge
│
├── renderer/
│   └── src/
│       ├── components/
│       ├── state/
│       ├── i18n/
│       └── theme/
│
└── shared/
    └── ...              # Shared types and IPC contracts
```

For deeper technical documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

# 🛠️ Technology Stack

| Area            | Technology                         |
| :-------------- | :--------------------------------- |
| **Desktop**     | Electron 33                        |
| **Language**    | TypeScript 5                       |
| **Frontend**    | React 18                           |
| **UI**          | Fluent UI + Tailwind CSS           |
| **Mail**        | IMAPFlow + Nodemailer + MailParser |
| **Database**    | SQLite + SQLCipher                 |
| **Search**      | SQLite FTS5                        |
| **Editor**      | Tiptap                             |
| **State**       | Zustand                            |
| **Validation**  | Zod                                |
| **Credentials** | Keytar + Electron safeStorage      |
| **Testing**     | Vitest + Playwright                |
| **Build**       | electron-vite + electron-builder   |

---

# 🔒 Security

Security is part of AuraMail's architecture rather than an optional feature.

### Local Database

Email data is stored in a local **SQLCipher-encrypted SQLite database** using AES-256 encryption.

### Encryption Key

The database encryption key is generated per installation and protected using Electron's `safeStorage`.

| Platform | Protection                               |
| :------- | :--------------------------------------- |
| Windows  | Windows DPAPI                            |
| Linux    | Secret Service / GNOME Keyring / KWallet |

### Account Credentials

Mailbox passwords and authentication tokens are stored using the operating system's credential manager through `keytar`.

They are **not stored inside the application database**.

### Electron Hardening

AuraMail uses:

```text
contextIsolation: true
sandbox: true
nodeIntegration: false
```

External links are opened through the system browser rather than inside the application.

For security-related details and vulnerability reporting, see [SECURITY.md](./SECURITY.md).

---

# 🐧 Linux

AuraMail supports modern Linux desktop environments including:

* GNOME
* KDE Plasma
* XFCE
* Cinnamon
* Other freedesktop-compatible environments

### Supported

**Display**

X11 and Wayland

**Secure Storage**

Secret Service, GNOME Keyring and KWallet

**Notifications**

freedesktop notification specification

**System Tray**

AppIndicator / StatusNotifierItem

**Power Management**

Automatic IMAP reconnection after suspend and resume

### Dependencies

#### Debian / Ubuntu / Mint / Pop!_OS

```bash
sudo apt install build-essential libsecret-1-dev python3
```

#### Fedora / RHEL

```bash
sudo dnf install make gcc-c++ libsecret-devel python3
```

#### Arch / Manjaro

```bash
sudo pacman -S base-devel libsecret python
```

---

# 🚀 Installation

## Requirements

* Windows 10 / 11 64-bit or modern Linux
* Node.js **24+**
* Git
* C/C++ build tools
* Linux: `libsecret` development libraries

### Clone

```bash
git clone https://github.com/qvbvs/auramail.git
cd auramail
```

### Install dependencies

```bash
npm install
```

### Prepare native modules

```bash
npm run setup
```

This prepares Electron and rebuilds native dependencies for the correct Electron ABI.

### Start development mode

```bash
npm run dev
```

For Linux + Wayland:

```bash
npm run dev -- --ozone-platform-hint=auto
```

---

# ⌨️ Keyboard Shortcuts

|              Shortcut              | Action            |
| :--------------------------------: | ----------------- |
|   <kbd>Ctrl</kbd> + <kbd>K</kbd>   | Command Palette   |
|            <kbd>C</kbd>            | New Message       |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Send              |
|           <kbd>Esc</kbd>           | Close active view |
|   <kbd>Ctrl</kbd> + <kbd>,</kbd>   | Settings          |
|            <kbd>E</kbd>            | Archive           |
|          <kbd>Delete</kbd>         | Move to Trash     |
|            <kbd>S</kbd>            | Star / Unstar     |

---

# 📦 Build

### Type checking

```bash
npm run typecheck
```

### Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Production build

```bash
npm run build
```

### Windows

```bash
npm run build:win
```

### Linux

```bash
npm run build:linux
```

### All platforms

```bash
npm run build:all
```

### Release

```bash
npm run release
```

Build artifacts are generated inside:

```text
dist/
```

Supported distribution formats include:

```text
Windows
└── .exe / NSIS

Linux
├── .AppImage
├── .deb
└── .rpm
```

---

# 🗺️ Roadmap

AuraMail is actively evolving.

Planned improvements include:

* [ ] More advanced automation rules
* [ ] Additional calendar integrations
* [ ] Improved contact management
* [ ] More customization options
* [ ] Performance improvements
* [ ] Additional localization
* [ ] Extended keyboard workflows

---

# 🤝 Contributing

Contributions, ideas and bug reports are welcome.

Before opening a pull request, please read:

**[CONTRIBUTING.md](./CONTRIBUTING.md)**

For security vulnerabilities, please follow the process described in:

**[SECURITY.md](./SECURITY.md)**

---

# 📄 License

AuraMail is released under the **MIT License**.

Copyright © 2026 **qvbvs**

---

<div align="center">

### ⚡ AuraMail

**Your inbox. Your device. Your data.**

Built with privacy and performance in mind.

<br />

[GitHub](https://github.com/qvbvs/auramail) · [Releases](https://github.com/qvbvs/auramail/releases) · [Security](./SECURITY.md)

</div>
