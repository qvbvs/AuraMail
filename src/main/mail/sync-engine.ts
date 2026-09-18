import type { ImapFlow, ListResponse } from 'imapflow'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { AccountSecurity, SyncResult } from '@shared/ipc'
import { getAccountConnectionInfo, setAccountStatus } from './accounts-repository'
import { guessFolderType, upsertFolder, recalculateUnreadCount, getFolderById } from './folders-repository'
import { upsertMessageHeader } from './messages-repository'
import { resolveThreadId, touchThread } from './threading'
import { resolveFollowUpsForIncomingMessage } from './follow-ups-repository'
import { extractAttachmentsFromBodyStructure, replaceMessageAttachments } from './attachments-repository'
import { recordBandwidth } from './bandwidth-repository'
import { listActiveIncomingRules, matchRule } from './rules-repository'
import { moveMessage } from './message-actions'
import { openImapClient } from './imap-client'

export { openImapClient }

const INITIAL_SYNC_MESSAGE_LIMIT = 200

function toAddrList(addrs: { address?: string; name?: string }[] | undefined): { email: string; name: string }[] {
  return (addrs ?? []).map((a) => ({ email: a.address ?? '', name: a.name ?? '' }))
}

interface NewIncomingMessage {
  id: string
  fromAddr: string
  fromName: string
  subject: string
}

interface FolderSyncResult {
  count: number
  newAdded: number
  bytesFetched: number
  newIncoming: NewIncomingMessage[]
}

async function syncFolderMessages(
  db: Database.Database,
  client: ImapFlow,
  accountId: string,
  folderId: string,
  exists: number,
  detectReplies: boolean
): Promise<FolderSyncResult> {
  let count = 0
  let newAdded = 0
  let bytesFetched = 0
  const newIncoming: NewIncomingMessage[] = []
  const from = Math.max(1, exists - INITIAL_SYNC_MESSAGE_LIMIT + 1)
  for await (const msg of client.fetch(`${from}:${exists}`, { envelope: true, flags: true, uid: true, size: true, bodyStructure: true })) {
    const envelope = msg.envelope
    const subject = envelope?.subject ?? '(brak tematu)'
    const from0 = envelope?.from?.[0]
    const references = (envelope?.inReplyTo ? [envelope.inReplyTo] : []) as string[]
    const threadId = resolveThreadId(db, {
      accountId,
      messageId: envelope?.messageId ?? null,
      inReplyTo: envelope?.inReplyTo ?? null,
      references,
      subject,
      dateReceived: envelope?.date ? new Date(envelope.date).toISOString() : null
    })

    const extractedAttachments = extractAttachmentsFromBodyStructure(msg.bodyStructure)
    const hasAttachments = extractedAttachments.some((a) => !a.isInline)

    const fromAddr = from0?.address ?? ''
    const fromName = from0?.name ?? ''
    const { id: messageId, isNew } = upsertMessageHeader(db, {
      accountId,
      folderId,
      uid: msg.uid,
      messageId: envelope?.messageId ?? null,
      inReplyTo: envelope?.inReplyTo ?? null,
      references,
      threadId,
      subject,
      fromAddr,
      fromName,
      toJson: JSON.stringify(toAddrList(envelope?.to)),
      ccJson: JSON.stringify(toAddrList(envelope?.cc)),
      bccJson: JSON.stringify(toAddrList(envelope?.bcc)),
      dateSent: envelope?.date ? new Date(envelope.date).toISOString() : null,
      dateReceived: envelope?.date ? new Date(envelope.date).toISOString() : null,
      isRead: msg.flags?.has('\\Seen') ?? false,
      isStarred: msg.flags?.has('\\Flagged') ?? false,
      isImportant: false,
      hasAttachments,
      sizeBytes: msg.size ?? 0,
      flagsRaw: JSON.stringify([...(msg.flags ?? [])])
    })
    replaceMessageAttachments(db, messageId, extractedAttachments)
    touchThread(db, threadId)
    if (detectReplies) {
      resolveFollowUpsForIncomingMessage(db, accountId, { inReplyTo: envelope?.inReplyTo ?? null, references })
    }
    if (isNew) {
      newAdded++
      if (detectReplies) {
        newIncoming.push({ id: messageId, fromAddr, fromName, subject })
      }
    }
    bytesFetched += msg.size ?? 0
    count++
  }
  return { count, newAdded, bytesFetched, newIncoming }
}

/**
 * Initial/incremental sync jednego konta: listuje foldery (mapując SPECIAL-USE), dla
 * INBOX, Sent oraz standardowych skrzynek pobiera nagłówki (ENVELOPE+FLAGS+UID) najnowszych
 * wiadomości i zapisuje lokalnie z grupowaniem w wątki.
 */
const activeAccountSyncs = new Map<string, Promise<SyncResult>>()

export async function syncAccount(db: Database.Database, accountId: string): Promise<SyncResult> {
  const existing = activeAccountSyncs.get(accountId)
  if (existing) {
    return existing
  }
  const promise = doSyncAccount(db, accountId).finally(() => {
    activeAccountSyncs.delete(accountId)
  })
  activeAccountSyncs.set(accountId, promise)
  return promise
}

async function doSyncAccount(db: Database.Database, accountId: string): Promise<SyncResult> {
  const info = await getAccountConnectionInfo(db, accountId)
  const client = openImapClient(info)
  let newMessages = 0
  let bytesFetched = 0
  let newIncoming: NewIncomingMessage[] = []
  const syncStartedAt = Date.now()

  try {
    await client.connect()

    const mailboxes: ListResponse[] = await client.list()

    for (const mbox of mailboxes) {
      const type = guessFolderType(mbox.path, mbox.specialUse)
      const isNoSelect = Boolean(mbox.flags && Array.from(mbox.flags).some((f) => f.toLowerCase() === '\\noselect'))

      // Folder nadrzędny/kontener bez własnych wiadomości (np. [Gmail]) nie może być wybrany przez SELECT
      if (isNoSelect) {
        upsertFolder(db, {
          accountId,
          imapPath: mbox.path,
          displayName: mbox.name || mbox.path,
          type,
          uidValidity: null,
          uidNext: null
        })
        continue
      }

      try {
        const lock = await client.getMailboxLock(mbox.path)
        try {
          const mailbox = client.mailbox || undefined
          const folderId = upsertFolder(db, {
            accountId,
            imapPath: mbox.path,
            displayName: mbox.name || mbox.path,
            type,
            uidValidity: mailbox ? Number(mailbox.uidValidity) : null,
            uidNext: mailbox ? mailbox.uidNext : null
          })

          // Pełny sync nagłówków robimy dla INBOX i Sent oraz standardowych folderów
          if (type === 'inbox' || type === 'sent' || type === 'archive' || type === 'trash' || type === 'spam' || type === 'drafts') {
            const exists = mailbox?.exists ?? 0
            if (exists > 0) {
              const folderResult = await syncFolderMessages(db, client, accountId, folderId, exists, type === 'inbox')
              newMessages += folderResult.newAdded
              bytesFetched += folderResult.bytesFetched
              recalculateUnreadCount(db, folderId)
              if (type === 'inbox') newIncoming = folderResult.newIncoming
            }
          }
        } finally {
          lock.release()
        }
      } catch {
        // Błąd jednego specyficznego folderu nie powinien przerywać synchronizacji całego konta
        upsertFolder(db, {
          accountId,
          imapPath: mbox.path,
          displayName: mbox.name || mbox.path,
          type,
          uidValidity: null,
          uidNext: null
        })
      }
    }

    setAccountStatus(db, accountId, 'active', null)
    recordBandwidth(db, {
      accountId,
      operation: 'sync',
      bytesTransferred: bytesFetched,
      durationMs: Date.now() - syncStartedAt
    })

    // Reguły filtrowania (Ustawienia → Filtry) — stosowane dopiero po zwolnieniu blokad
    // folderów przez połączenie synchronizujące; każde przeniesienie używa własnego,
    // krótkotrwałego połączenia IMAP (message-actions.moveMessage).
    if (newIncoming.length > 0) {
      const rules = listActiveIncomingRules(db, accountId)
      if (rules.length > 0) {
        for (const msg of newIncoming) {
          const rule = rules.find((r) => matchRule(r, msg))
          if (rule) {
            await moveMessage(db, msg.id, rule.actionMoveToFolderId).catch(() => {
              // Nie przerywaj syncu, jeśli jedna reguła zawiedzie (np. folder usunięty na serwerze)
            })
          }
        }
      }
    }

    return { accountId, newMessages, status: 'active', error: null }
  } catch (err) {
    const message = (err as Error).message
    setAccountStatus(db, accountId, 'error', message)
    return { accountId, newMessages, status: 'error', error: message }
  } finally {
    try {
      await client.logout()
    } catch {
      // połączenie mogło już paść — nic do zrobienia
    }
  }
}

export async function fetchMessageSource(
  info: { id: string; imapHost: string; imapPort: number; imapSecurity: AccountSecurity; email: string; password: string },
  folderImapPath: string,
  uid: number,
  db?: Database.Database
): Promise<Buffer> {
  const client = openImapClient(info)
  const startedAt = Date.now()
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folderImapPath)
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
      if (!msg || !msg.source) throw new Error('Nie udało się pobrać treści wiadomości')
      if (db) {
        recordBandwidth(db, {
          accountId: info.id,
          operation: 'sync',
          bytesTransferred: msg.source.length,
          durationMs: Date.now() - startedAt
        })
      }
      return msg.source
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function syncSingleFolder(
  db: Database.Database,
  accountId: string,
  folderId: string
): Promise<{ count: number; error: string | null }> {
  const folder = getFolderById(db, folderId)
  if (!folder) return { count: 0, error: 'Nie znaleziono folderu' }

  const info = await getAccountConnectionInfo(db, accountId)
  const client = openImapClient(info)
  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder.imapPath)
    try {
      const mailbox = client.mailbox || undefined
      const exists = mailbox?.exists ?? 0
      if (exists > 0) {
        const folderResult = await syncFolderMessages(db, client, accountId, folderId, exists, folder.type === 'inbox')
        recalculateUnreadCount(db, folderId)
        return { count: folderResult.newAdded, error: null }
      }
      return { count: 0, error: null }
    } finally {
      lock.release()
    }
  } catch (err) {
    return { count: 0, error: (err as Error).message }
  } finally {
    await client.logout().catch(() => {})
  }
}

