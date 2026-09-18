import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { SnoozedMessageSummary } from '@shared/ipc'

interface SnoozedRow {
  id: string
  message_id: string
  snooze_until: string
  account_id: string
  folder_id: string
  thread_id: string | null
  subject: string
  from_addr: string
  from_name: string
  snippet: string
  date_received: string | null
  is_read: number
  is_starred: number
  is_important: number
  is_pinned: number
  has_attachments: number
}

function toSummary(row: SnoozedRow): SnoozedMessageSummary {
  return {
    id: row.message_id,
    accountId: row.account_id,
    folderId: row.folder_id,
    threadId: row.thread_id,
    subject: row.subject,
    fromAddr: row.from_addr,
    fromName: row.from_name,
    snippet: row.snippet,
    dateReceived: row.date_received,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    isImportant: Boolean(row.is_important),
    isPinned: Boolean(row.is_pinned),
    hasAttachments: Boolean(row.has_attachments),
    threadCount: 1,
    snoozeUntil: row.snooze_until
  }
}

/** Uśpienie: znika z Inbox (filtr w listMessages po messages.snoozed_until), wraca automatycznie (plan 7.15). */
export function snoozeMessage(db: Database.Database, messageId: string, snoozeUntil: string): void {
  const message = db.prepare('SELECT folder_id FROM messages WHERE id = ?').get(messageId) as { folder_id: string } | undefined
  if (!message) throw new Error('Wiadomość nie istnieje')

  db.prepare('UPDATE messages SET snoozed_until = ? WHERE id = ?').run(snoozeUntil, messageId)
  db.prepare(
    `INSERT INTO snoozed_messages (id, message_id, snooze_until, original_folder_id, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(randomUUID(), messageId, snoozeUntil, message.folder_id, new Date().toISOString())
}

export function listSnoozed(db: Database.Database): SnoozedMessageSummary[] {
  const rows = db
    .prepare(
      `SELECT sm.id, sm.message_id, sm.snooze_until, m.account_id, m.folder_id, m.thread_id, m.subject,
              m.from_addr, m.from_name, m.snippet, m.date_received, m.is_read, m.is_starred, m.is_important, m.is_pinned, m.has_attachments
       FROM snoozed_messages sm
       JOIN messages m ON m.id = sm.message_id
       WHERE m.snoozed_until IS NOT NULL
       ORDER BY sm.snooze_until ASC`
    )
    .all() as SnoozedRow[]
  return rows.map(toSummary)
}

export function listDueSnoozed(db: Database.Database, nowIso: string): { snoozedId: string; messageId: string; subject: string }[] {
  return db
    .prepare(
      `SELECT sm.id as snoozedId, sm.message_id as messageId, m.subject as subject
       FROM snoozed_messages sm JOIN messages m ON m.id = sm.message_id
       WHERE sm.snooze_until <= ? AND m.snoozed_until IS NOT NULL`
    )
    .all(nowIso) as { snoozedId: string; messageId: string; subject: string }[]
}

export function wakeSnoozed(db: Database.Database, snoozedId: string, messageId: string): void {
  db.prepare('UPDATE messages SET snoozed_until = NULL WHERE id = ?').run(messageId)
  db.prepare('DELETE FROM snoozed_messages WHERE id = ?').run(snoozedId)
}
