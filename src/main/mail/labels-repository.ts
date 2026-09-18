import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { LabelSummary, MessageListItem } from '@shared/ipc'

interface LabelRow {
  id: string
  name: string
  color: string
  account_id: string | null
  message_count: number
  unread_count: number
}

export function listLabels(db: Database.Database, accountId?: string): LabelSummary[] {
  // Pobierz wszystkie etykiety (globalne account_id IS NULL lub dedykowane dla konta)
  // wraz z liczbą powiązanych wiadomości i liczbą nieprzeczytanych
  const query = accountId
    ? `
      SELECT 
        l.id, l.name, l.color, l.account_id,
        COUNT(DISTINCT ml.message_id) AS message_count,
        SUM(CASE WHEN m.is_read = 0 AND m.deleted_locally = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM labels l
      LEFT JOIN message_labels ml ON l.id = ml.label_id
      LEFT JOIN messages m ON ml.message_id = m.id AND m.deleted_locally = 0
      WHERE (l.account_id IS NULL OR l.account_id = ?)
      GROUP BY l.id
      ORDER BY l.name ASC
    `
    : `
      SELECT 
        l.id, l.name, l.color, l.account_id,
        COUNT(DISTINCT ml.message_id) AS message_count,
        SUM(CASE WHEN m.is_read = 0 AND m.deleted_locally = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM labels l
      LEFT JOIN message_labels ml ON l.id = ml.label_id
      LEFT JOIN messages m ON ml.message_id = m.id AND m.deleted_locally = 0
      GROUP BY l.id
      ORDER BY l.name ASC
    `

  const rows = (accountId ? db.prepare(query).all(accountId) : db.prepare(query).all()) as LabelRow[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    accountId: r.account_id,
    messageCount: Number(r.message_count || 0),
    unreadCount: Number(r.unread_count || 0)
  }))
}

export function createLabel(
  db: Database.Database,
  name: string,
  color: string,
  accountId?: string | null
): LabelSummary {
  const id = `lbl-${randomUUID()}`
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO labels (id, name, color, account_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), color || '#6366f1', accountId || null, now)

  return {
    id,
    name: name.trim(),
    color: color || '#6366f1',
    accountId: accountId || null,
    messageCount: 0,
    unreadCount: 0
  }
}

export function updateLabel(
  db: Database.Database,
  id: string,
  name: string,
  color: string
): LabelSummary {
  db.prepare(`
    UPDATE labels SET name = ?, color = ? WHERE id = ?
  `).run(name.trim(), color, id)

  const row = db.prepare(`
    SELECT l.id, l.name, l.color, l.account_id,
      COUNT(DISTINCT ml.message_id) AS message_count,
      SUM(CASE WHEN m.is_read = 0 AND m.deleted_locally = 0 THEN 1 ELSE 0 END) AS unread_count
    FROM labels l
    LEFT JOIN message_labels ml ON l.id = ml.label_id
    LEFT JOIN messages m ON ml.message_id = m.id AND m.deleted_locally = 0
    WHERE l.id = ?
    GROUP BY l.id
  `).get(id) as LabelRow | undefined

  if (!row) {
    throw new Error(`Nie znaleziono etykiety o ID ${id}`)
  }

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    accountId: row.account_id,
    messageCount: Number(row.message_count || 0),
    unreadCount: Number(row.unread_count || 0)
  }
}

export function deleteLabel(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM labels WHERE id = ?').run(id)
}

export function getLabelsForMessage(db: Database.Database, messageId: string): LabelSummary[] {
  const rows = db.prepare(`
    SELECT l.id, l.name, l.color, l.account_id
    FROM labels l
    JOIN message_labels ml ON l.id = ml.label_id
    WHERE ml.message_id = ?
    ORDER BY l.name ASC
  `).all(messageId) as { id: string; name: string; color: string; account_id: string | null }[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    accountId: r.account_id,
    messageCount: 0,
    unreadCount: 0
  }))
}

export function addLabelToMessage(db: Database.Database, messageId: string, labelId: string): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO message_labels (message_id, label_id, created_at)
    VALUES (?, ?, ?)
  `).run(messageId, labelId, now)
}

export function removeLabelFromMessage(db: Database.Database, messageId: string, labelId: string): void {
  db.prepare(`
    DELETE FROM message_labels WHERE message_id = ? AND label_id = ?
  `).run(messageId, labelId)
}

export function listMessagesByLabel(
  db: Database.Database,
  labelId: string,
  limit = 100,
  offset = 0,
  sortOrder = 'date_desc'
): MessageListItem[] {
  let orderClause = 'm.date_received DESC'
  if (sortOrder === 'date_asc') {
    orderClause = 'm.date_received ASC'
  } else if (sortOrder === 'unread_first') {
    orderClause = 'm.is_read ASC, m.date_received DESC'
  }

  const rows = db.prepare(`
    SELECT 
      m.id, m.account_id, m.folder_id, m.thread_id, m.subject,
      m.from_addr, m.from_name, m.to_json, m.cc_json, m.bcc_json,
      m.snippet, m.body_html, m.body_plain, m.date_received,
      m.is_read, m.is_starred, m.is_important, m.is_pinned,
      m.has_attachments,
      t.message_count AS thread_count,
      a.email AS account_email,
      a.color AS account_color
    FROM messages m
    JOIN message_labels ml ON m.id = ml.message_id
    LEFT JOIN threads t ON m.thread_id = t.id
    LEFT JOIN accounts a ON m.account_id = a.id
    WHERE ml.label_id = ? AND m.deleted_locally = 0
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?
  `).all(labelId, limit, offset) as any[]

  const items: MessageListItem[] = rows.map((row) => ({
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
  }))

  attachLabelsToMessages(db, items)
  return items
}

export function attachLabelsToMessages(db: Database.Database, items: MessageListItem[]): void {
  if (items.length === 0) return
  const ids = items.map((m) => m.id)
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT ml.message_id, l.id, l.name, l.color, l.account_id
    FROM message_labels ml
    JOIN labels l ON ml.label_id = l.id
    WHERE ml.message_id IN (${placeholders})
    ORDER BY l.name ASC
  `).all(...ids) as { message_id: string; id: string; name: string; color: string; account_id: string | null }[]

  const map = new Map<string, LabelSummary[]>()
  for (const r of rows) {
    let arr = map.get(r.message_id)
    if (!arr) {
      arr = []
      map.set(r.message_id, arr)
    }
    arr.push({
      id: r.id,
      name: r.name,
      color: r.color,
      accountId: r.account_id,
      messageCount: 0,
      unreadCount: 0
    })
  }

  for (const item of items) {
    item.labels = map.get(item.id) || []
  }
}
