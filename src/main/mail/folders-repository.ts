import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { FolderSummary, FolderType } from '@shared/ipc'

interface FolderRow {
  id: string
  account_id: string
  display_name: string
  type: string
  unread_count: number
}

function toSummary(row: FolderRow): FolderSummary {
  return {
    id: row.id,
    accountId: row.account_id,
    displayName: row.display_name,
    type: row.type as FolderType,
    unreadCount: row.unread_count
  }
}

export function listFolders(db: Database.Database, accountId: string): FolderSummary[] {
  const rows = db
    .prepare('SELECT * FROM folders WHERE account_id = ? ORDER BY sort_order ASC, display_name ASC')
    .all(accountId) as FolderRow[]
  return rows.map(toSummary)
}

export function getFolderByPath(db: Database.Database, accountId: string, imapPath: string): { id: string } | undefined {
  return db
    .prepare('SELECT id FROM folders WHERE account_id = ? AND imap_path = ?')
    .get(accountId, imapPath) as { id: string } | undefined
}

export function getFolderById(db: Database.Database, folderId: string): { id: string; accountId: string; imapPath: string; type: FolderType } | undefined {
  return db
    .prepare('SELECT id, account_id as accountId, imap_path as imapPath, type FROM folders WHERE id = ?')
    .get(folderId) as { id: string; accountId: string; imapPath: string; type: FolderType } | undefined
}

export function findFolderByType(db: Database.Database, accountId: string, type: FolderType): { id: string; imapPath: string } | undefined {
  return db
    .prepare('SELECT id, imap_path as imapPath FROM folders WHERE account_id = ? AND type = ? LIMIT 1')
    .get(accountId, type) as { id: string; imapPath: string } | undefined
}

/** Zgaduje typ folderu z SPECIAL-USE (RFC 6154) z fallbackiem po nazwie — patrz plan sekcja 7.7. */
export function guessFolderType(imapPath: string, specialUse: string | undefined): FolderType {
  const map: Record<string, FolderType> = {
    '\\Inbox': 'inbox',
    '\\Sent': 'sent',
    '\\Drafts': 'drafts',
    '\\Archive': 'archive',
    '\\All': 'archive',
    '\\Junk': 'spam',
    '\\Trash': 'trash'
  }
  if (specialUse && map[specialUse]) return map[specialUse]

  const lower = imapPath.toLowerCase()
  if (lower === 'inbox') return 'inbox'
  if (/(sent|wysłane|wyslane)/.test(lower)) return 'sent'
  if (/(draft|robocz)/.test(lower)) return 'drafts'
  if (/(archiv|all mail|wszystkie)/.test(lower)) return 'archive'
  if (/(spam|junk)/.test(lower)) return 'spam'
  if (/(trash|kosz|deleted)/.test(lower)) return 'trash'
  return 'custom'
}

export function upsertFolder(
  db: Database.Database,
  params: { accountId: string; imapPath: string; displayName: string; type: FolderType; uidValidity: number | null; uidNext: number | null }
): string {
  const existing = getFolderByPath(db, params.accountId, params.imapPath)
  if (existing) {
    db.prepare('UPDATE folders SET display_name = ?, type = ?, uid_validity = ?, uid_next = ? WHERE id = ?').run(
      params.displayName,
      params.type,
      params.uidValidity,
      params.uidNext,
      existing.id
    )
    return existing.id
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO folders (id, account_id, imap_path, display_name, type, sort_order, uid_validity, uid_next, unread_count)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`
  ).run(id, params.accountId, params.imapPath, params.displayName, params.type, params.uidValidity, params.uidNext)
  return id
}

export function recalculateUnreadCount(db: Database.Database, folderId: string): void {
  const { c } = db
    .prepare('SELECT COUNT(*) as c FROM messages WHERE folder_id = ? AND is_read = 0 AND deleted_locally = 0')
    .get(folderId) as { c: number }
  db.prepare('UPDATE folders SET unread_count = ? WHERE id = ?').run(c, folderId)
}

export function getUnifiedUnreadCount(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c
       FROM messages m
       JOIN folders f ON f.id = m.folder_id
       WHERE f.type = 'inbox' AND m.is_read = 0 AND m.deleted_locally = 0`
    )
    .get() as { c: number } | undefined
  return row?.c ?? 0
}

