import { simpleParser } from 'mailparser'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { MessageDetail } from '@shared/ipc'
import { getAccountConnectionInfo } from './accounts-repository'
import { getMessageDetail, getMessageImapRef, saveMessageBody } from './messages-repository'
import { fetchMessageSource } from './sync-engine'

/**
 * Leniwe pobranie treści wiadomości (plan sekcja 5/9: metadata przy sync nagłówków,
 * treść na żądanie). Sanityzacja HTML przed renderem odbywa się w rendererze (DOMPurify +
 * sandboxed iframe, patrz Reader.tsx) — tu tylko surowy, sparsowany HTML/plain z MIME.
 */
export async function getOrFetchMessageBody(db: Database.Database, messageId: string): Promise<MessageDetail> {
  const existing = getMessageDetail(db, messageId)
  if (!existing) throw new Error('Wiadomość nie istnieje')
  if (existing.bodyHtml !== null || existing.bodyPlain !== null) return existing

  const ref = getMessageImapRef(db, messageId)
  if (!ref) throw new Error('Brak referencji IMAP dla tej wiadomości')

  const info = await getAccountConnectionInfo(db, ref.accountId)
  const source = await fetchMessageSource(info, ref.folderImapPath, ref.uid, db)
  const parsed = await simpleParser(source)

  const bodyHtml = typeof parsed.html === 'string' ? parsed.html : null
  const bodyPlain = parsed.text ?? null
  const snippet = (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 150)

  saveMessageBody(db, messageId, bodyHtml, bodyPlain, snippet)
  return { ...existing, bodyHtml, bodyPlain, snippet }
}
