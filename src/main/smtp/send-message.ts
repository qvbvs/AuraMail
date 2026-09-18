import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { ImapFlow } from 'imapflow'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { AccountSecurity, SendMessageInput } from '@shared/ipc'
import { getAccountConnectionInfo } from '../mail/accounts-repository'
import { guessFolderType, upsertFolder } from '../mail/folders-repository'
import { upsertMessageHeader } from '../mail/messages-repository'
import { resolveThreadId, touchThread } from '../mail/threading'
import { recordBandwidth } from '../mail/bandwidth-repository'

function buildRawMessage(info: { email: string }, input: SendMessageInput, messageId: string): Promise<Buffer> {
  const composer = new MailComposer({
    from: info.email,
    to: input.to,
    cc: input.cc.length ? input.cc : undefined,
    bcc: input.bcc.length ? input.bcc : undefined,
    subject: input.subject,
    html: input.bodyHtml,
    messageId,
    attachments: input.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.mimeType,
      content: Buffer.from(a.contentBase64, 'base64')
    }))
  })
  return new Promise((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err)
      else resolve(message)
    })
  })
}

async function appendToSentFolder(
  db: Database.Database,
  accountId: string,
  info: { imapHost: string; imapPort: number; imapSecurity: AccountSecurity; email: string; password: string },
  raw: Buffer
): Promise<{ folderId: string; uid: number } | null> {
  const client = new ImapFlow({
    host: info.imapHost,
    port: info.imapPort,
    secure: info.imapSecurity === 'ssl',
    auth: { user: info.email, pass: info.password },
    logger: false
  })
  await client.connect()
  try {
    const mailboxes = await client.list()
    const sent = mailboxes.find((m) => m.specialUse === '\\Sent') ?? mailboxes.find((m) => /sent|wysłane/i.test(m.path))
    if (!sent) return null

    const folderId = upsertFolder(db, {
      accountId,
      imapPath: sent.path,
      displayName: sent.name || sent.path,
      type: guessFolderType(sent.path, sent.specialUse),
      uidValidity: null,
      uidNext: null
    })

    const result = await client.append(sent.path, raw, ['\\Seen'])
    if (!result || result.uid === undefined) return null
    return { folderId, uid: result.uid }
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Wysyła wiadomość przez SMTP, archiwizuje dokładnie ten sam surowy MIME w Sent (plan 7.11/9.1)
 * i od razu tworzy lokalny wpis w `messages` dla tej kopii — bez czekania na kolejny sync —
 * żeby ewentualny follow-up (patrz 7.15) miał do czego się odnieść natychmiast.
 */
export async function sendMessage(db: Database.Database, input: SendMessageInput): Promise<void> {
  const info = await getAccountConnectionInfo(db, input.accountId)
  const messageId = `<${randomUUID()}@${hostname()}>`
  const raw = await buildRawMessage(info, input, messageId)

  const transporter = nodemailer.createTransport({
    host: info.smtpHost,
    port: info.smtpPort,
    secure: info.smtpSecurity === 'ssl',
    requireTLS: info.smtpSecurity === 'starttls',
    auth: { user: info.email, pass: info.password }
  })
  const sendStartedAt = Date.now()
  await transporter.sendMail({ raw, envelope: { from: info.email, to: [...input.to, ...input.cc, ...input.bcc] } })
  recordBandwidth(db, {
    accountId: input.accountId,
    operation: 'send',
    bytesTransferred: raw.length,
    durationMs: Date.now() - sendStartedAt
  })

  const appended = await appendToSentFolder(db, input.accountId, info, raw).catch(() => null)
  if (!appended) return // wysyłka OK — brak zapisu w Sent nadrobi kolejny sync, nie jest to błąd krytyczny

  const now = new Date().toISOString()
  const threadId = resolveThreadId(db, {
    accountId: input.accountId,
    messageId,
    inReplyTo: null,
    references: [],
    subject: input.subject,
    dateReceived: now
  })
  const { id: sentMessageId } = upsertMessageHeader(db, {
    accountId: input.accountId,
    folderId: appended.folderId,
    uid: appended.uid,
    messageId,
    inReplyTo: null,
    references: [],
    threadId,
    subject: input.subject,
    fromAddr: info.email,
    fromName: '',
    toJson: JSON.stringify(input.to.map((email) => ({ email, name: '' }))),
    ccJson: JSON.stringify(input.cc.map((email) => ({ email, name: '' }))),
    bccJson: JSON.stringify(input.bcc.map((email) => ({ email, name: '' }))),
    dateSent: now,
    dateReceived: now,
    isRead: true,
    isStarred: false,
    isImportant: false,
    hasAttachments: input.attachments.length > 0,
    sizeBytes: raw.length,
    flagsRaw: JSON.stringify(['\\Seen'])
  })
  touchThread(db, threadId)

  if (input.followUpAfterHours) {
    const remindAfter = new Date(Date.now() + input.followUpAfterHours * 3600_000).toISOString()
    db.prepare(
      `INSERT INTO follow_ups (id, sent_message_id, remind_after, status, created_at) VALUES (?, ?, ?, 'pending', ?)`
    ).run(randomUUID(), sentMessageId, remindAfter, now)
  }
}
