import type Database from 'better-sqlite3-multiple-ciphers'

// Pełny schemat wg planu architektury (sekcja 5). Wersjonowany przez tabelę
// schema_migrations — kolejne migracje dopisywane są jako kolejne wpisy MIGRATIONS,
// nigdy przez edycję już zastosowanej migracji.

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          imap_host TEXT NOT NULL,
          imap_port INTEGER NOT NULL,
          imap_security TEXT NOT NULL CHECK (imap_security IN ('none','ssl','starttls')),
          smtp_host TEXT NOT NULL,
          smtp_port INTEGER NOT NULL,
          smtp_security TEXT NOT NULL CHECK (smtp_security IN ('none','ssl','starttls')),
          auth_type TEXT NOT NULL CHECK (auth_type IN ('password','oauth2_google','oauth2_microsoft')),
          credential_ref TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          sync_frequency_sec INTEGER NOT NULL DEFAULT 300,
          idle_enabled INTEGER NOT NULL DEFAULT 1,
          color TEXT NOT NULL DEFAULT '#4A6CF7',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','disabled')),
          last_error TEXT
        );

        CREATE TABLE folders (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          imap_path TEXT NOT NULL,
          display_name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('inbox','sent','drafts','archive','spam','trash','custom')),
          parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          uid_validity INTEGER,
          uid_next INTEGER,
          unread_count INTEGER NOT NULL DEFAULT 0,
          UNIQUE (account_id, imap_path)
        );

        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          root_subject_normalized TEXT NOT NULL,
          message_count INTEGER NOT NULL DEFAULT 0,
          last_message_at TEXT,
          has_unread INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
          uid INTEGER NOT NULL,
          message_id TEXT,
          in_reply_to TEXT,
          references_raw TEXT,
          thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
          subject TEXT NOT NULL DEFAULT '',
          from_addr TEXT NOT NULL DEFAULT '',
          from_name TEXT NOT NULL DEFAULT '',
          to_json TEXT NOT NULL DEFAULT '[]',
          cc_json TEXT NOT NULL DEFAULT '[]',
          bcc_json TEXT NOT NULL DEFAULT '[]',
          date_sent TEXT,
          date_received TEXT,
          snippet TEXT NOT NULL DEFAULT '',
          body_html TEXT,
          body_plain TEXT,
          is_read INTEGER NOT NULL DEFAULT 0,
          is_starred INTEGER NOT NULL DEFAULT 0,
          is_important INTEGER NOT NULL DEFAULT 0,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          has_attachments INTEGER NOT NULL DEFAULT 0,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          flags_raw TEXT NOT NULL DEFAULT '',
          snoozed_until TEXT,
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          UNIQUE (account_id, folder_id, uid)
        );
        CREATE INDEX idx_messages_thread_id ON messages(thread_id);
        CREATE INDEX idx_messages_message_id ON messages(message_id);
        CREATE INDEX idx_messages_folder_date ON messages(folder_id, date_received DESC);

        CREATE VIRTUAL TABLE messages_fts USING fts5(
          subject, body_plain, from_name, from_addr,
          content='messages', content_rowid='rowid'
        );
        CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, subject, body_plain, from_name, from_addr)
          VALUES (new.rowid, new.subject, new.body_plain, new.from_name, new.from_addr);
        END;
        CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, subject, body_plain, from_name, from_addr)
          VALUES ('delete', old.rowid, old.subject, old.body_plain, old.from_name, old.from_addr);
        END;
        CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, subject, body_plain, from_name, from_addr)
          VALUES ('delete', old.rowid, old.subject, old.body_plain, old.from_name, old.from_addr);
          INSERT INTO messages_fts(rowid, subject, body_plain, from_name, from_addr)
          VALUES (new.rowid, new.subject, new.body_plain, new.from_name, new.from_addr);
        END;

        CREATE TABLE attachments (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          content_id TEXT,
          is_inline INTEGER NOT NULL DEFAULT 0,
          local_path TEXT,
          downloaded_at TEXT
        );
        CREATE INDEX idx_attachments_message_id ON attachments(message_id);

        CREATE TABLE contacts (
          id TEXT PRIMARY KEY,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          company TEXT,
          notes TEXT,
          avatar_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE contact_emails (
          id TEXT PRIMARY KEY,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          is_primary INTEGER NOT NULL DEFAULT 0,
          UNIQUE (contact_id, email)
        );
        CREATE INDEX idx_contact_emails_email ON contact_emails(email);

        CREATE TABLE contact_phones (
          id TEXT PRIMARY KEY,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          phone TEXT NOT NULL,
          label TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE contact_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE contact_group_members (
          group_id TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
          contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          PRIMARY KEY (group_id, contact_id)
        );

        CREATE TABLE templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT '',
          body_html TEXT NOT NULL DEFAULT '',
          account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
          attachments_json TEXT,
          signature_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE signatures (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          body_html TEXT NOT NULL DEFAULT '',
          account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
          is_default_for_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL
        );

        CREATE TABLE scheduled_messages (
          id TEXT PRIMARY KEY,
          draft_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          send_at TEXT NOT NULL,
          timezone TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_scheduled_pending ON scheduled_messages(status, send_at);

        CREATE TABLE snoozed_messages (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          snooze_until TEXT NOT NULL,
          original_folder_id TEXT NOT NULL REFERENCES folders(id),
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_snoozed_until ON snoozed_messages(snooze_until);

        CREATE TABLE follow_ups (
          id TEXT PRIMARY KEY,
          sent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          remind_after TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','cancelled')),
          resolved_reason TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_follow_ups_pending ON follow_ups(status, remind_after);

        CREATE TABLE quick_replies (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          body_text TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE rules (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          conditions_json TEXT NOT NULL,
          actions_json TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          applies_on TEXT NOT NULL DEFAULT 'incoming' CHECK (applies_on IN ('incoming','manual'))
        );

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'global'
        );

        CREATE TABLE sync_state (
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
          last_synced_at TEXT,
          last_uid_seen INTEGER NOT NULL DEFAULT 0,
          sync_status TEXT NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle','syncing','error')),
          error_message TEXT,
          PRIMARY KEY (account_id, folder_id)
        );

        CREATE TABLE local_action_queue (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          action_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','syncing','failed')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX idx_queue_pending ON local_action_queue(status, created_at);

        CREATE TABLE app_lock_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          pin_hash TEXT,
          auto_lock_minutes INTEGER NOT NULL DEFAULT 15,
          biometric_enabled INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE calendar_events (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          start_tz TEXT NOT NULL,
          end_tz TEXT NOT NULL,
          all_day INTEGER NOT NULL DEFAULT 0,
          color TEXT NOT NULL DEFAULT '#4f46e5',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_calendar_events_account ON calendar_events(account_id, start_tz);

        CREATE TABLE bandwidth_stats (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
          operation TEXT NOT NULL CHECK (operation IN ('sync', 'send')),
          bytes_transferred INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL
        );
        CREATE INDEX idx_bandwidth_account ON bandwidth_stats(account_id, timestamp);
      `)
    }
  },
  {
    version: 2,
    name: 'scheduler_send_later_and_follow_up_tracking',
    up: (db) => {
      // v1 wiązał scheduled_messages z draft_message_id -> messages(id), co wymagałoby
      // pełnego mechanizmu auto-save-drafts synchronizowanych do IMAP Drafts (plan 7.5) —
      // niezbudowanego jeszcze. Dla "Wyślij później" wystarczy samodzielny payload_json
      // z pełną treścią do wysłania; pełna widoczność w folderze Drafts to osobny, przyszły
      // krok. SQLite nie pozwala usunąć kolumny/FK przez ALTER, więc tabela jest odtwarzana.
      db.exec(`
        CREATE TABLE scheduled_messages_new (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          payload_json TEXT NOT NULL,
          send_at TEXT NOT NULL,
          timezone TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
        DROP TABLE scheduled_messages;
        ALTER TABLE scheduled_messages_new RENAME TO scheduled_messages;
        CREATE INDEX idx_scheduled_pending ON scheduled_messages(status, send_at);

        ALTER TABLE follow_ups ADD COLUMN notified_at TEXT;
      `)
    }
  },
  {
    version: 3,
    name: 'attachment_position_index',
    up: (db) => {
      // Kolejność załącznika w drzewie MIME wiadomości — używana do dopasowania
      // wpisu w tabeli attachments (wypełnianej podczas sync z bodyStructure) do
      // indeksu zwracanego przez mailparser przy pobieraniu (messages:downloadAttachment).
      db.exec(`ALTER TABLE attachments ADD COLUMN position INTEGER NOT NULL DEFAULT 0;`)
    }
  },
  {
    version: 4,
    name: 'labels_and_message_labels',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS labels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#6366f1',
          account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS message_labels (
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (message_id, label_id)
        );
        CREATE INDEX IF NOT EXISTS idx_message_labels_message ON message_labels(message_id);
        CREATE INDEX IF NOT EXISTS idx_message_labels_label ON message_labels(label_id);

        INSERT OR IGNORE INTO labels (id, name, color, account_id, created_at) VALUES
          ('lbl-priority', 'Priorytet', '#6366f1', NULL, datetime('now')),
          ('lbl-clients', 'Klienci & Kontrakty', '#38bdf8', NULL, datetime('now')),
          ('lbl-finance', 'Finanse i Faktury', '#2dd4bf', NULL, datetime('now')),
          ('lbl-urgent', 'Pilne', '#f43f5e', NULL, datetime('now'));
      `)
    }
  }
]

export function migrate(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const appliedVersions = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => (r as { version: number }).version)
  )

  const pending = MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const applyMigration = db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString()
      )
    })
    applyMigration()
  }
}
