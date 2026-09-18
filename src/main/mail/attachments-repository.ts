import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { AttachmentWithMessage } from '@shared/ipc'
import type { MessageStructureObject } from 'imapflow'

export interface ExtractedAttachment {
  filename: string
  mimeType: string
  sizeBytes: number
  isInline: boolean
  contentId: string | null
}

/** Rekurencyjnie schodzi po drzewie MIME (bodyStructure z IMAP FETCH) i zbiera
 * węzły będące załącznikami lub obrazami inline — bez pobierania treści wiadomości. */
export function extractAttachmentsFromBodyStructure(node: MessageStructureObject | undefined): ExtractedAttachment[] {
  if (!node) return []
  const result: ExtractedAttachment[] = []

  function walk(n: MessageStructureObject): void {
    const isAttachmentDisposition = n.disposition === 'attachment'
    const isInlineWithFilename = n.disposition === 'inline' && Boolean(n.dispositionParameters?.filename || n.parameters?.name)
    const filename = n.dispositionParameters?.filename || n.parameters?.name || null

    if ((isAttachmentDisposition || isInlineWithFilename) && n.type) {
      result.push({
        filename: filename || 'załącznik',
        mimeType: n.type,
        sizeBytes: n.size ?? 0,
        isInline: n.disposition === 'inline',
        contentId: n.id ?? null
      })
    }

    if (n.childNodes) {
      for (const child of n.childNodes) walk(child)
    }
  }

  walk(node)
  return result
}

/** Zastępuje zapisane metadane załączników wiadomości świeżym zestawem z aktualnego syncu. */
export function replaceMessageAttachments(db: Database.Database, messageId: string, attachments: ExtractedAttachment[]): void {
  db.prepare('DELETE FROM attachments WHERE message_id = ?').run(messageId)
  if (attachments.length === 0) return
  const insert = db.prepare(
    `INSERT INTO attachments (id, message_id, filename, mime_type, size_bytes, content_id, is_inline, position)
     VALUES (@id, @messageId, @filename, @mimeType, @sizeBytes, @contentId, @isInline, @position)`
  )
  const insertAll = db.transaction((rows: ExtractedAttachment[]) => {
    rows.forEach((att, index) => {
      insert.run({
        id: randomUUID(),
        messageId,
        filename: att.filename,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        contentId: att.contentId,
        isInline: att.isInline ? 1 : 0,
        position: index
      })
    })
  })
  insertAll(attachments)
}

interface AttachmentWithMessageRow {
  id: string
  message_id: string
  filename: string
  mime_type: string
  size_bytes: number
  is_inline: number
  content_id: string | null
  downloaded_at: string | null
  local_path: string | null
  from_name: string
  from_addr: string
  date_received: string | null
  subject: string
}

/** Lista wszystkich niewbudowanych (nie-inline) załączników dla konta — realne dane z lokalnej bazy,
 * zbierane podczas sync z bodyStructure IMAP, bez ponownego pobierania treści wiadomości. */
export function listAttachmentsForAccount(db: Database.Database, accountId: string): AttachmentWithMessage[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.message_id, a.filename, a.mime_type, a.size_bytes, a.is_inline, a.content_id,
              a.downloaded_at, a.local_path, a.position, m.from_name, m.from_addr, m.date_received, m.subject
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
       WHERE m.account_id = ? AND m.deleted_locally = 0 AND a.is_inline = 0
       ORDER BY m.date_received DESC`
    )
    .all(accountId) as (AttachmentWithMessageRow & { position: number })[]

  return rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    isInline: Boolean(row.is_inline),
    contentId: row.content_id,
    downloadedAt: row.downloaded_at,
    localPath: row.local_path,
    position: row.position,
    senderName: row.from_name,
    senderEmail: row.from_addr,
    dateReceived: row.date_received,
    subject: row.subject
  }))
}

