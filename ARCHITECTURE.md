# AuraMail Architecture

This document describes the Electron process structure, data model, mail synchronization flow, and security model of AuraMail. It complements [README.md](./README.md) and serves as an entry point for anyone wishing to contribute or add new features.

---

## Process Separation

Electron divides the application into isolated process boundaries. AuraMail strictly adheres to this architectural separation:

```
┌─────────────────────────┐          IPC (Contract: src/shared/ipc.ts)          ┌──────────────────────────┐
│     Renderer (React)    │ ──────────────────────────────────────────────────▶ │       Main (Node.js)     │
│   src/renderer/src/     │ ◀────────────────────────────────────────────────── │   src/main/              │
│   No Node.js APIs       │             contextBridge (src/preload/)            │   IMAP/SMTP/SQLite/tray  │
└─────────────────────────┘                                                     └──────────────────────────┘
```

- **`src/main`** — The sole process with direct access to the filesystem, network sockets, SQLite database, and the OS Credential Manager. Hosts the IMAP engine, background synchronization worker, SMTP transport, background scheduler, system tray, and all registered IPC handlers.
- **`src/preload`** — The single isolation boundary that bridges Node.js and the web execution context. Exposes narrow, strictly-typed methods to the renderer via `contextBridge.exposeInMainWorld`. The renderer has no `nodeIntegration` and cannot access `ipcRenderer` directly.
- **`src/renderer`** — A pure React application. Operates without direct Node.js knowledge, communicating exclusively through `window.mailapp.*` (provided by the preload bridge).
- **`src/shared`** — Code shared between both main and renderer processes: `ipc.ts` defines IPC channel tokens (`IPC.*`) alongside request/response TypeScript interfaces. Any data-layer schema modification begins here.

### Window Hardening (`src/main/index.ts`)

Every `BrowserWindow` instance enforces rigorous security constraints:
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false`.
- Production build enforcement: Strict `Content-Security-Policy` header (`default-src 'self'`, with exceptions only for Google Fonts/icons).
- Strict navigation hooks (`will-navigate` and `setWindowOpenHandler`): Any URL outside `file://` (and local dev server) opens exclusively in the user's default external browser, never inside the application window.
- Window close interception: Closing the main window (`close`) hides it to the system tray rather than terminating the process. Complete shutdown occurs only via tray exit or explicit `app.quit()`.

---

## IPC Contract & Flow

The standard architectural pattern for every main ↔ renderer interaction:

1. **Channel Token & Type Definition** in `src/shared/ipc.ts` (e.g. `IPC.messagesSend`, `SendMessageInput`).
2. **Main Handler Registration** in `src/main/ipc/index.ts` — Validates incoming payloads using Zod schemas, delegates execution to dedicated repositories/services in `src/main/mail|calendar|scheduler|...`, and returns a strongly-typed response.
3. **Preload Bridge Method** in `src/preload/index.ts` — Exposes a dedicated typed method on the `mailapp` object invoking `ipcRenderer.invoke(IPC.xxx, ...)`. Raw channel strings are never visible to renderer code.
4. **Zustand State Store** in `src/renderer/src/state/` — Invokes `window.mailapp.*` and holds reactive state for the UI components.

Adding a cross-boundary feature always follows these four steps in sequential order.

---

## Data Model (SQLite / SQLCipher)

Schema definitions and migrations reside in `src/main/database/schema.ts`. Database schema versions are tracked in `schema_migrations`. Schema evolution follows an **append-only strategy** at the end of the `MIGRATIONS` array, never modifying previously applied migration entries.

### Core Database Tables

| Table | Purpose |
|---|---|
| `accounts` | IMAP and SMTP connection parameters (credentials stored externally; see `credential_ref`). |
| `folders` | Per-account mailboxes maintaining `uid_validity` and `uid_next` cursors for delta synchronization. |
| `threads` / `messages` | Email messages and conversation threads mapped via `Message-Id`, `In-Reply-To`, `References`, and normalized subjects. |
| `messages_fts` | SQLite FTS5 full-text search virtual index (subject, body, sender) synchronized via SQLite triggers. |
| `attachments` | Attachment metadata extracted from IMAP `bodyStructure`; `position` indexes the MIME tree for on-demand downloading. |
| `contacts`, `contact_emails`, `contact_phones`, `contact_groups` | Local address book independent of remote mail accounts. |
| `templates`, `signatures`, `quick_replies` | Reusable snippets, signatures, and quick reply templates for the email composer. |
| `scheduled_messages` | Outbox queue for delayed sending ("Send Later") with delivery statuses (`pending`, `sent`, `failed`, `cancelled`). |
| `snoozed_messages` | Temporarily hidden messages scheduled for wake-up into their target folder. |
| `follow_ups` | Automated follow-up reminders when no reply is received within a target timeframe. |
| `rules` | Automated rules for incoming message routing by sender, subject, or recipient. |
| `labels` / `message_labels` | User-defined tags and categories independent of IMAP folder structures. |
| `calendar_events` | Local calendar store supporting all-day and scheduled events with timezone metadata. |
| `sync_state` | Synchronization markers per account/folder to ensure resilient resumption after application restart. |
| `local_action_queue` | Offline mutation queue to replay actions once connection is re-established. |
| `bandwidth_stats` | Real-time network telemetry (bytes transferred, duration) per sync/send operation. |
| `app_lock_settings` | App lock and security PIN configuration. |
| `settings` | Key-value application preferences (e.g. language, desktop notification toggles). |

> [!IMPORTANT]
> Account passwords and authentication tokens are **never written to the SQLite database**. The `accounts.credential_ref` column holds an opaque reference pointing to the host OS credential vault (Windows Credential Manager on Windows, `libsecret` / GNOME Keyring / KWallet on Linux).

---

## Mail Synchronization Engine

Two independent mechanisms coordinate to keep the local database synchronized with upstream mail servers:

### 1. Real-Time IMAP IDLE (`src/main/mail/idle-manager.ts`)

For every account with IDLE enabled (`accounts.idle_enabled`), the `IdleManager` maintains a persistent `imapflow` connection locking the `INBOX` mailbox:

- **`exists` event** (new message detected) → Fetches headers/envelope, resolves thread grouping (`threading.ts`), extracts attachment metadata from `bodyStructure`, saves records to SQLite, resolves pending `follow_ups`, applies automated **rules** for folder routing, dispatches system notifications and optional audio alerts, and broadcasts `broadcastToWindows('sync:new-message', ...)` to all renderer windows.
- **`flags` event** → Synchronizes `is_read` and `is_starred` states locally and updates unread count badges.
- **`expunge` event** → Broadcasts deletion notifications to the renderer.
- **Connection Drops** (`error` / `close`) → Reconnects with **exponential backoff and jitter** (`min(60s, 3s · 1.5^attempt) + random(0-2s)`).
- **System Power Hooks** → Listens to `powerMonitor.on('resume')` and `powerMonitor.on('unlock-screen')` (using Windows power events and Linux D-Bus `org.freedesktop.login1` / UPower) to force `idleManager.reconnectAll()`, preventing stale socket lockups after system sleep.

### 2. Scheduled Background Pull (`src/main/scheduler/index.ts` → `src/main/mail/sync-engine.ts`)

A periodic background scheduler (`tick()` every 30 seconds) evaluates whether an account's `sync_frequency_sec` interval (default 300s, minimum 60s) has elapsed, triggering full folder synchronization when due.

The same scheduler loop processes time-sensitive background queues:
- **`scheduled_messages`** — Sends queued emails whose `send_at` timestamp has arrived. Messages older than 24 hours (e.g. computer was turned off) are marked as `failed` to prevent accidental outdated delivery.
- **`snoozed_messages`** — Wakes up snoozed emails by restoring them to their original mailbox and notifying the user.
- **`follow_ups`** — Alerts the user when an expected response has not arrived within the specified time window.

---

## Security Architecture

| Asset / Boundary | Storage Location | Protection Mechanism |
|---|---|---|
| **SQLCipher Encryption Key** | `db.key.enc` in `userData`, isolated from the SQLite file | 32 cryptographically random bytes encrypted via Electron `safeStorage` (backed by **Windows DPAPI** on Windows or **Secret Service API / GNOME Keyring / KWallet** on Linux). Copying the `.db` file without the user's OS keyring access is unusable. |
| **Account Credentials** | OS Credential Manager | Never stored in SQLite or logs. Managed via `keytar` (**Windows Credential Manager** on Windows, **libsecret** on Linux; `src/main/security/secrets.ts`). |
| **Email Content & Database** | Local SQLite file | AES-256 encrypted using SQLCipher (`better-sqlite3-multiple-ciphers`). |
| **Renderer Windows** | Web UI sandbox | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict production CSP. |
| **External Links & HTML** | External default browser | Intercepted at process level; email HTML sanitized with `dompurify`. |

---

## Contributor Guide: Where to Add Features

| Objective | Starting Point |
|---|---|
| Add a new IPC endpoint | `src/shared/ipc.ts` → `src/main/ipc/index.ts` → `src/preload/index.ts` |
| Add a table, column, or index | New migration object appended to `MIGRATIONS` in `src/main/database/schema.ts` |
| Add a recurring background task | Implement in `src/main/scheduler/` and invoke from `tick()` |
| Handle new real-time mail events | `handleNewIncomingMessages` in `src/main/mail/idle-manager.ts` |
| Add a new UI view or panel | React component in `src/renderer/src/components/`, registered in `App.tsx` and driven by a Zustand store |
| Add or modify translation strings | Update keys symmetrically in both `pl.ts` and `en.ts` under `src/renderer/src/i18n/locales/` |
