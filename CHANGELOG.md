# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Complete internationalization (i18n) overhaul with 100% key symmetry across Polish and English dictionaries.
- Localized system default labels (`Priority`, `Clients & Contracts`, `Finance & Invoices`, `Urgent`).
- Dynamic main process localization for system tray menus and background desktop push notifications.
- High-resolution preview visual assets generated with English test mock data.
- Modernized, professional English documentation suite.

---

## [0.1.0] - 2026-09-18

Initial release.

### Added
- Multi-account IMAP/SMTP client with unified inbox view.
- Real-time IMAP IDLE push synchronization with exponential backoff and automatic system resume recovery.
- Local encrypted SQLite database using SQLCipher (`better-sqlite3-multiple-ciphers`) with FTS5 offline search.
- OS credential security via Windows Credential Manager (`keytar`) and DPAPI-backed `safeStorage` database key encryption.
- Modern rich text composer powered by Tiptap (formatting, code blocks, links, attachments, and reusable templates).
- Advanced scheduling: "Send Later", message snoozing, and automated response follow-up reminders.
- Message automation rules and custom labels independent of remote IMAP directory hierarchies.
- Integrated calendar view supporting day, week, month, and agenda modes.
- Contact Dossier and Thread Dossier views for deep context on correspondence history and collaboration metrics.
- Global Command Palette (`Ctrl+K` / `⌘K`) for rapid keyboard navigation.
- System tray background minimization, strict Electron sandbox security, and CSP enforcement.
- Bilingual interface support (Polish and English) with auto-detection.

[Unreleased]: https://github.com/qvbvs/auramail/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/qvbvs/auramail/releases/tag/v0.1.0
