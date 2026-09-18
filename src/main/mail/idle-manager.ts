import { BrowserWindow, Notification } from 'electron'
import log from 'electron-log'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { ImapFlow, MailboxLockObject } from 'imapflow'
import type { AccountConnectionStatus, ConnectionState, MessageListItem } from '@shared/ipc'
import { getAccountConnectionInfo, listAccountsForAutoSync } from './accounts-repository'
import { findFolderByType, recalculateUnreadCount } from './folders-repository'
import { upsertMessageHeader } from './messages-repository'
import { resolveThreadId, touchThread } from './threading'
import { extractAttachmentsFromBodyStructure, replaceMessageAttachments } from './attachments-repository'
import { resolveFollowUpsForIncomingMessage } from './follow-ups-repository'
import { listActiveIncomingRules, matchRule } from './rules-repository'
import { moveMessage } from './message-actions'
import { openImapClient } from './imap-client'
import { getSetting } from '../settings/settings-repository'
import { mt } from '../i18n'

interface IdleSession {
  accountId: string
  client: ImapFlow | null
  lock: MailboxLockObject | null
  state: ConnectionState
  lastError: string | null
  lastSyncedAt: string | null
  retryCount: number
  retryTimer: NodeJS.Timeout | null
  isStopped: boolean
}

const sessions = new Map<string, IdleSession>()

function toAddrList(addrs: { address?: string; name?: string }[] | undefined): { email: string; name: string }[] {
  return (addrs ?? []).map((a) => ({ email: a.address ?? '', name: a.name ?? '' }))
}

function broadcastToWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

function focusMainWindowAndOpenMessage(accountId: string, folderId: string, messageId: string): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const win = windows[0]
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('notification:open-message', { accountId, folderId, messageId })
  }
}

class IdleManager {
  private db: Database.Database | null = null

  public start(db: Database.Database): void {
    this.db = db
    const accounts = listAccountsForAutoSync(db)
    for (const acc of accounts) {
      this.startAccount(acc.id)
    }
  }

  public startAccount(accountId: string): void {
    if (!this.db) return
    this.stopAccount(accountId)

    const session: IdleSession = {
      accountId,
      client: null,
      lock: null,
      state: 'connecting',
      lastError: null,
      lastSyncedAt: null,
      retryCount: 0,
      retryTimer: null,
      isStopped: false
    }
    sessions.set(accountId, session)
    this.connectSession(session)
  }

  private async connectSession(session: IdleSession): Promise<void> {
    if (session.isStopped || !this.db) return

    session.state = session.retryCount > 0 ? 'reconnecting' : 'connecting'
    this.broadcastStatus(session)

    let info
    try {
      info = await getAccountConnectionInfo(this.db, session.accountId)
    } catch (err) {
      session.state = 'error'
      session.lastError = (err as Error).message
      this.broadcastStatus(session)
      return
    }

    const client = openImapClient(info)
    session.client = client

    client.on('error', (err: Error) => {
      log.warn(`[idle:${session.accountId}] błąd połączenia IMAP:`, err.message)
      this.handleDisconnect(session, err.message)
    })

    client.on('close', () => {
      log.info(`[idle:${session.accountId}] połączenie IMAP zamknięte`)
      this.handleDisconnect(session, 'Połączenie zamknięte')
    })

    try {
      await client.connect()
      session.retryCount = 0
      session.state = 'connected'
      session.lastError = null
      session.lastSyncedAt = new Date().toISOString()
      this.broadcastStatus(session)

      const inbox = findFolderByType(this.db, session.accountId, 'inbox')
      const imapPath = inbox ? inbox.imapPath : 'INBOX'
      const folderId = inbox ? inbox.id : null

      const lock = await client.getMailboxLock(imapPath)
      session.lock = lock

      client.on('exists', async (data: { count: number; prevCount: number }) => {
        log.info(`[idle:${session.accountId}] odebrano zdarzenie exists: ${data.prevCount} -> ${data.count}`)
        if (data.count > data.prevCount && folderId && this.db) {
          await this.handleNewIncomingMessages(session, client, folderId, data.prevCount + 1, data.count)
        }
      })

      ;(client as any).on('flags', (data: { uid: number; flags: Set<string> }) => {
        if (!this.db || !folderId) return
        try {
          const isRead = data.flags.has('\\Seen') ? 1 : 0
          const isStarred = data.flags.has('\\Flagged') ? 1 : 0
          this.db
            .prepare('UPDATE messages SET is_read = ?, is_starred = ? WHERE account_id = ? AND folder_id = ? AND uid = ?')
            .run(isRead, isStarred, session.accountId, folderId, data.uid)
          recalculateUnreadCount(this.db, folderId)
          broadcastToWindows('sync:message-updated', { accountId: session.accountId, folderId, uid: data.uid })
        } catch (err) {
          log.error(`[idle:${session.accountId}] błąd aktualizacji flag:`, err)
        }
      })

      ;(client as any).on('expunge', (data: { seq: number }) => {
        log.info(`[idle:${session.accountId}] usunięto wiadomość na serwerze (seq ${data.seq})`)
        broadcastToWindows('sync:message-deleted', { accountId: session.accountId, folderId })
      })

      // Uruchomienie pętli IDLE na skrzynce
      await client.idle()
    } catch (err) {
      log.warn(`[idle:${session.accountId}] błąd nawiązywania IDLE:`, (err as Error).message)
      this.handleDisconnect(session, (err as Error).message)
    }
  }

  private async handleNewIncomingMessages(
    session: IdleSession,
    client: ImapFlow,
    folderId: string,
    fromSeq: number,
    toSeq: number
  ): Promise<void> {
    if (!this.db) return
    const db = this.db
    const accountId = session.accountId

    try {
      const notifyEnabled = getSetting(db, 'notifyNewMail') !== 'false'
      const notifyDesktop = getSetting(db, 'notifyDesktop') !== 'false'
      const notifySound = getSetting(db, 'notifySound') !== 'false'
      const notifyPreview = getSetting(db, 'notifyPreview') !== 'false'

      const rules = listActiveIncomingRules(db, accountId)

      for await (const msg of client.fetch(`${fromSeq}:${toSeq}`, {
        envelope: true,
        flags: true,
        uid: true,
        size: true,
        bodyStructure: true
      })) {
        const envelope = msg.envelope
        const subject = envelope?.subject ?? '(brak tematu)'
        const from0 = envelope?.from?.[0]
        const fromAddr = from0?.address ?? ''
        const fromName = from0?.name ?? ''
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
        resolveFollowUpsForIncomingMessage(db, accountId, { inReplyTo: envelope?.inReplyTo ?? null, references })
        recalculateUnreadCount(db, folderId)

        if (isNew) {
          // Zastosowanie reguł filtrowania
          if (rules.length > 0) {
            const rule = rules.find((r) => matchRule(r, { fromAddr, fromName, subject }))
            if (rule) {
              await moveMessage(db, messageId, rule.actionMoveToFolderId).catch(() => {})
            }
          }

          // Desktop notification
          if (notifyEnabled && notifyDesktop) {
            const senderDisplayName = fromName || fromAddr || mt('notifyNewMessageDefaultSender')
            const notification = new Notification({
              title: mt('notifyNewMessageTitle', { name: senderDisplayName }),
              body: notifyPreview ? subject : mt('notifyNewMessageDefaultBody')
            })
            notification.on('click', () => {
              focusMainWindowAndOpenMessage(accountId, folderId, messageId)
            })
            notification.show()
          }

          // Dźwięk powiadomienia
          if (notifyEnabled && notifySound) {
            broadcastToWindows('notify:sound')
          }

          // Pobranie zaktualizowanego obiektu z bazy i natychmiastowe wypchnięcie do UI
          const createdRow = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as any
          if (createdRow) {
            const item: MessageListItem = {
              id: createdRow.id,
              accountId: createdRow.account_id,
              folderId: createdRow.folder_id,
              threadId: createdRow.thread_id,
              subject: createdRow.subject,
              fromAddr: createdRow.from_addr,
              fromName: createdRow.from_name,
              snippet: createdRow.snippet,
              dateReceived: createdRow.date_received,
              isRead: Boolean(createdRow.is_read),
              isStarred: Boolean(createdRow.is_starred),
              isImportant: Boolean(createdRow.is_important),
              isPinned: Boolean(createdRow.is_pinned),
              hasAttachments: Boolean(createdRow.has_attachments),
              threadCount: 1
            }
            broadcastToWindows('sync:new-message', { accountId, folderId, message: item })
          }
        }
      }

      session.lastSyncedAt = new Date().toISOString()
      this.broadcastStatus(session)
    } catch (err) {
      log.error(`[idle:${session.accountId}] błąd przetwarzania nowej poczty:`, err)
    }
  }

  private handleDisconnect(session: IdleSession, reason: string): void {
    if (session.isStopped) return

    try {
      session.lock?.release()
    } catch {}
    session.lock = null

    try {
      session.client?.close()
    } catch {}
    session.client = null

    session.retryCount++
    session.state = 'reconnecting'
    session.lastError = reason
    this.broadcastStatus(session)

    if (session.retryTimer) clearTimeout(session.retryTimer)
    const delay = Math.min(60_000, 3000 * Math.pow(1.5, Math.min(session.retryCount, 6))) + Math.floor(Math.random() * 2000)
    log.info(`[idle:${session.accountId}] ponowna próba połączenia za ${(delay / 1000).toFixed(1)}s (próba ${session.retryCount})`)

    session.retryTimer = setTimeout(() => {
      this.connectSession(session)
    }, delay)
  }

  public stopAccount(accountId: string): void {
    const session = sessions.get(accountId)
    if (!session) return

    session.isStopped = true
    if (session.retryTimer) {
      clearTimeout(session.retryTimer)
      session.retryTimer = null
    }

    try {
      session.lock?.release()
    } catch {}
    session.lock = null

    try {
      session.client?.close()
    } catch {}
    session.client = null

    session.state = 'idle'
    this.broadcastStatus(session)
    sessions.delete(accountId)
  }

  public reconnectAll(): void {
    if (!this.db) return
    log.info('[idle] wymuszenie ponownego połączenia wszystkich sesji (sieć/wybudzenie)')
    const accounts = listAccountsForAutoSync(this.db)
    for (const acc of accounts) {
      this.startAccount(acc.id)
    }
  }

  public stopAll(): void {
    for (const [accId] of sessions) {
      this.stopAccount(accId)
    }
  }

  public getStatus(accountId: string): AccountConnectionStatus {
    const session = sessions.get(accountId)
    if (!session) {
      return {
        accountId,
        state: 'idle',
        lastError: null,
        lastSyncedAt: null,
        idling: false
      }
    }
    return {
      accountId,
      state: session.state,
      lastError: session.lastError,
      lastSyncedAt: session.lastSyncedAt,
      idling: session.state === 'connected' && session.lock !== null
    }
  }

  public getAllStatuses(): AccountConnectionStatus[] {
    const res: AccountConnectionStatus[] = []
    for (const [accountId] of sessions) {
      res.push(this.getStatus(accountId))
    }
    return res
  }

  private broadcastStatus(session: IdleSession): void {
    const status = this.getStatus(session.accountId)
    broadcastToWindows('connection:status', status)
  }
}

export const idleManager = new IdleManager()
