# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.** Instead, submit your report privately through one of the following channels:

- Via GitHub Security Advisories: Click **Security → Report a vulnerability** on the repository page.
- Direct contact with the project maintainer.

Please provide the following information in your report:
- The specific AuraMail version or commit hash.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Potential impact and threat assessment (what an attacker could achieve).

We will acknowledge receipt of your vulnerability report, assess its severity, and prioritize a patch. Fixes will be released promptly, and reporters will be coordinated with prior to public disclosure.

---

## Vulnerability Scope

The following areas are considered security priorities:
- Renderer sandbox escapes or bypassing `contextIsolation`.
- Leakage of account secrets (passwords or session tokens) into the SQLite database, logs, or renderer context.
- Extraction of the database encryption key (`db.key.enc`) without access to the user's active OS login session or desktop keyring.
- Stored cross-site scripting (XSS) or code execution via incoming HTML emails displayed in `Reader`.
- Bypassing Content Security Policy (CSP) or navigation protections allowing remote resources to execute inside the native window.
- IPC vulnerabilities or improper Zod validation enabling unauthorized filesystem or database manipulation.

---

## Security Model Overview

For comprehensive architectural specifications, refer to [ARCHITECTURE.md § Security Architecture](./ARCHITECTURE.md#security-architecture).

- **Encrypted Local Storage**: The entire local database is encrypted using SQLCipher (AES-256). The encryption key is stored separately from the database file and is encrypted using Electron's `safeStorage` API (backed by the **Windows Data Protection API (DPAPI)** on Windows and the **Secret Service API / GNOME Keyring / KWallet** on Linux).
- **Zero Secrets in SQLite**: Mail account passwords and authentication tokens are kept exclusively in the native OS credential vault via `keytar` (**Windows Credential Manager** on Windows, **libsecret** on Linux).
- **Renderer Hardening**: Every `BrowserWindow` runs with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and `webSecurity: true`.
- **Strict CSP**: A strict Content-Security-Policy is enforced in production builds, restricting resources to trusted application assets and Google fonts/icons.
- **Strict Navigation Guard**: All external links and navigation attempts outside `file://` open exclusively in the host system's default browser.
- **HTML Sanitization**: All incoming HTML email bodies are sanitized via `dompurify` prior to DOM insertion.

---

## Supported Versions

| Version | Supported |
|---|---|
| Latest release on `main` | :white_check_mark: |
| < 0.1.0 | :x: |
