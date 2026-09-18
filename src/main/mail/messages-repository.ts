import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { MessageDetail, MessageListItem } from '@shared/ipc'
import { attachLabelsToMessages } from './labels-repository'

export interface UpsertMessageHeaderInput {
  accountId: string
  folderId: string
  uid: number
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  threadId: string
  subject: string
  fromAddr: string
  fromName: string
  toJson: string
  ccJson: string
  bccJson: string
  dateSent: string | null
  dateReceived: string | null
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  hasAttachments: boolean
  sizeBytes: number
  flagsRaw: string
}

interface MessageRow {
  id: string
  account_id: string
  folder_id: string
  thread_id: string | null
  subject: string
  from_addr: string
  from_name: string
  to_json: string
  cc_json: string
  bcc_json: string
  snippet: string
  body_html: string | null
  body_plain: string | null
  date_received: string | null
  is_read: number
  is_starred: number
  is_important: number
  is_pinned: number
  has_attachments: number
  thread_count: number | null
  account_email?: string
  account_color?: string
}

function toListItem(row: MessageRow): MessageListItem {
  return {
    id: row.id,
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
    threadCount: row.thread_count ?? 1,
    accountEmail: row.account_email,
    accountColor: row.account_color
  }
}

export interface UpsertMessageHeaderResult {
  id: string
  isNew: boolean
}

export function upsertMessageHeader(db: Database.Database, input: UpsertMessageHeaderInput): UpsertMessageHeaderResult {
  const existing = db
    .prepare('SELECT id FROM messages WHERE account_id = ? AND folder_id = ? AND uid = ?')
    .get(input.accountId, input.folderId, input.uid) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE messages SET is_read = ?, is_starred = ?, is_important = ?, flags_raw = ? WHERE id = ?`
    ).run(input.isRead ? 1 : 0, input.isStarred ? 1 : 0, input.isImportant ? 1 : 0, input.flagsRaw, existing.id)
    return { id: existing.id, isNew: false }
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO messages (
      id, account_id, folder_id, uid, message_id, in_reply_to, references_raw, thread_id,
      subject, from_addr, from_name, to_json, cc_json, bcc_json, date_sent, date_received,
      snippet, is_read, is_starred, is_important, has_attachments, size_bytes, flags_raw
    ) VALUES (
      @id, @accountId, @folderId, @uid, @messageId, @inReplyTo, @referencesRaw, @threadId,
      @subject, @fromAddr, @fromName, @toJson, @ccJson, @bccJson, @dateSent, @dateReceived,
      '', @isRead, @isStarred, @isImportant, @hasAttachments, @sizeBytes, @flagsRaw
    )`
  ).run({
    id,
    accountId: input.accountId,
    folderId: input.folderId,
    uid: input.uid,
    messageId: input.messageId,
    inReplyTo: input.inReplyTo,
    referencesRaw: JSON.stringify(input.references),
    threadId: input.threadId,
    subject: input.subject,
    fromAddr: input.fromAddr,
    fromName: input.fromName,
    toJson: input.toJson,
    ccJson: input.ccJson,
    bccJson: input.bccJson,
    dateSent: input.dateSent,
    dateReceived: input.dateReceived,
    isRead: input.isRead ? 1 : 0,
    isStarred: input.isStarred ? 1 : 0,
    isImportant: input.isImportant ? 1 : 0,
    hasAttachments: input.hasAttachments ? 1 : 0,
    sizeBytes: input.sizeBytes,
    flagsRaw: input.flagsRaw
  })
  return { id, isNew: true }
}

export function listMessages(
  db: Database.Database,
  folderId: string,
  limit = 100,
  offset = 0,
  sortOrder: 'date_desc' | 'date_asc' | 'unread_first' = 'date_desc'
): MessageListItem[] {
  let orderClause = 'm.date_received DESC'
  if (sortOrder === 'date_asc') orderClause = 'm.date_received ASC'
  else if (sortOrder === 'unread_first') orderClause = 'm.is_read ASC, m.date_received DESC'

  const rows = db
    .prepare(
      `SELECT m.*, t.message_count as thread_count, a.email as account_email, a.color as account_color
       FROM messages m
       JOIN accounts a ON a.id = m.account_id
       LEFT JOIN threads t ON t.id = m.thread_id
       WHERE m.folder_id = ? AND m.deleted_locally = 0 AND m.snoozed_until IS NULL
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`
    )
    .all(folderId, limit, offset) as MessageRow[]
  const items = rows.map(toListItem)
  attachLabelsToMessages(db, items)
  return items
}

export function listUnifiedMessages(
  db: Database.Database,
  limit = 100,
  offset = 0,
  sortOrder: 'date_desc' | 'date_asc' | 'unread_first' = 'date_desc'
): MessageListItem[] {
  let orderClause = 'm.date_received DESC'
  if (sortOrder === 'date_asc') orderClause = 'm.date_received ASC'
  else if (sortOrder === 'unread_first') orderClause = 'm.is_read ASC, m.date_received DESC'

  const rows = db
    .prepare(
      `SELECT m.*, t.message_count as thread_count, a.email as account_email, a.color as account_color
       FROM messages m
       JOIN folders f ON f.id = m.folder_id
       JOIN accounts a ON a.id = m.account_id
       LEFT JOIN threads t ON t.id = m.thread_id
       WHERE f.type = 'inbox' AND m.deleted_locally = 0 AND m.snoozed_until IS NULL
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as MessageRow[]
  const items = rows.map(toListItem)
  attachLabelsToMessages(db, items)
  return items
}

export function getMessageDetail(db: Database.Database, id: string): MessageDetail | undefined {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
  if (!row) return undefined
  const item = toListItem(row)
  attachLabelsToMessages(db, [item])
  return {
    ...item,
    toJson: row.to_json,
    ccJson: row.cc_json,
    bccJson: row.bcc_json,
    bodyHtml: row.body_html,
    bodyPlain: row.body_plain
  }
}

export function getMessageImapRef(
  db: Database.Database,
  id: string
): { accountId: string; folderImapPath: string; uid: number } | undefined {
  return db
    .prepare(
      `SELECT m.account_id as accountId, f.imap_path as folderImapPath, m.uid as uid
       FROM messages m JOIN folders f ON f.id = m.folder_id WHERE m.id = ?`
    )
    .get(id) as { accountId: string; folderImapPath: string; uid: number } | undefined
}

export interface MessageFullRef {
  accountId: string
  folderId: string
  folderImapPath: string
  uid: number
  messageIdHeader: string | null
}

export function getMessageFullRef(db: Database.Database, id: string): MessageFullRef | undefined {
  return db
    .prepare(
      `SELECT m.account_id as accountId, m.folder_id as folderId, f.imap_path as folderImapPath,
              m.uid as uid, m.message_id as messageIdHeader
       FROM messages m JOIN folders f ON f.id = m.folder_id WHERE m.id = ?`
    )
    .get(id) as MessageFullRef | undefined
}

export function saveMessageBody(db: Database.Database, id: string, bodyHtml: string | null, bodyPlain: string | null, snippet: string): void {
  db.prepare('UPDATE messages SET body_html = ?, body_plain = ?, snippet = ? WHERE id = ?').run(bodyHtml, bodyPlain, snippet, id)
}

export function updateMessageFlags(db: Database.Database, id: string, flags: { isRead?: boolean; isStarred?: boolean }): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (flags.isRead !== undefined) {
    sets.push('is_read = ?')
    values.push(flags.isRead ? 1 : 0)
  }
  if (flags.isStarred !== undefined) {
    sets.push('is_starred = ?')
    values.push(flags.isStarred ? 1 : 0)
  }
  if (sets.length === 0) return
  values.push(id)
  db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function updateMessagePinned(db: Database.Database, id: string, pinned: boolean): void {
  db.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
}

/** Aktualizuje lokalizację wiadomości po realnym przeniesieniu IMAP (messageMove) —
 * zachowuje ten sam lokalny `id` (i powiązane FK: attachments, follow_ups, itd). */
export function updateMessageLocation(db: Database.Database, id: string, location: { folderId: string; uid: number }): void {
  db.prepare('UPDATE messages SET folder_id = ?, uid = ? WHERE id = ?').run(location.folderId, location.uid, id)
}

export function deleteMessageRow(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id)
}

/** Pełnotekstowe wyszukiwanie po całej skrzynce konta przez FTS5 (temat/treść/nadawca) —
 * niezależnie od tego, który folder jest aktualnie załadowany w rendererze. */
export function searchMessages(db: Database.Database, accountId: string, query: string, limit = 30): MessageListItem[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  // Proste, bezpieczne dopasowanie prefiksowe każdego słowa — unika błędów składni FTS5
  // przy znakach specjalnych wpisywanych przez użytkownika w locie.
  const ftsQuery = trimmed
    .split(/\s+/)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(' ')
  const rows = db
    .prepare(
      `SELECT m.*, t.message_count as thread_count
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       LEFT JOIN threads t ON t.id = m.thread_id
       WHERE messages_fts MATCH ? AND m.account_id = ? AND m.deleted_locally = 0
       ORDER BY rank
       LIMIT ?`
    )
    .all(ftsQuery, accountId, limit) as MessageRow[]
  const items = rows.map(toListItem)
  attachLabelsToMessages(db, items)
  return items
}
