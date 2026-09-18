import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import log from 'electron-log'
import { IPC } from '@shared/ipc'
import { getDb } from '../database'
import {
  createAccount,
  deleteAccount,
  listAccounts,
  setDefaultAccount,
  getAccountConnectionInfo,
  updateAccount,
  updateAccountCredential
} from '../mail/accounts-repository'
import { runConnectionDiagnostics } from '../mail/test-connection'
import { listFolders } from '../mail/folders-repository'
import { listMessages, listUnifiedMessages, getMessageImapRef, searchMessages } from '../mail/messages-repository'
import { syncAccount, syncSingleFolder, fetchMessageSource } from '../mail/sync-engine'
import { idleManager } from '../mail/idle-manager'
import { getOrFetchMessageBody } from '../mail/message-body'
import { listAttachmentsForAccount } from '../mail/attachments-repository'
import { listRecentBandwidth } from '../mail/bandwidth-repository'
import { setMessageFlags, moveMessage, deleteMessagePermanently } from '../mail/message-actions'
import {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelsForMessage,
  addLabelToMessage,
  removeLabelFromMessage,
  listMessagesByLabel
} from '../mail/labels-repository'
import { updateMessagePinned } from '../mail/messages-repository'
import { listRules, createRule, setRuleActive, deleteRule } from '../mail/rules-repository'
import { getSetting, setSetting } from '../settings/settings-repository'
import { updateTrayLanguage } from '../tray'
import { sendMessage } from '../smtp/send-message'
import { listSnoozed, snoozeMessage } from '../mail/snoozed-repository'
import { cancelFollowUp, listFollowUps } from '../mail/follow-ups-repository'
import { cancelScheduled, insertScheduled, listScheduled } from '../scheduler/scheduled-repository'
import { simpleParser } from 'mailparser'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent
} from '../calendar/calendar-repository'

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip'
}

function withErrorLogging<Args extends unknown[], R>(
  channel: string,
  handler: (...args: Args) => R | Promise<R>
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    try {
      return await handler(...args)
    } catch (err) {
      log.error(`[ipc:${channel}]`, err)
      throw err
    }
  }
}

const securitySchema = z.enum(['none', 'ssl', 'starttls'])
const looseEmail = z.string().regex(/^[^\s@]+@[^\s@]+$/, 'Nieprawidłowy adres e-mail')
const createAccountSchema = z.object({
  email: looseEmail,
  displayName: z.string().min(1).max(200),
  imapHost: z.string().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: securitySchema,
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: securitySchema,
  authType: z.enum(['password', 'oauth2_google', 'oauth2_microsoft']),
  password: z.string().min(1).max(1024),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
})
const testConnectionSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  security: securitySchema,
  protocol: z.enum(['imap', 'smtp']),
  email: looseEmail,
  password: z.string().min(1).max(1024)
})
const deleteAccountSchema = z.string().uuid()
const uuidSchema = z.string().uuid()
const listMessagesSchema = z.object({
  folderId: z.string().uuid(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  sortOrder: z.enum(['date_desc', 'date_asc', 'unread_first']).optional()
})
const listUnifiedMessagesSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  sortOrder: z.enum(['date_desc', 'date_asc', 'unread_first']).optional()
})
const syncFolderSchema = z.object({
  accountId: z.string().uuid(),
  folderId: z.string().uuid()
})
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const sendMessageSchema = z.object({
  accountId: z.string().uuid(),
  to: z.array(looseEmail).min(1),
  cc: z.array(looseEmail),
  bcc: z.array(looseEmail),
  subject: z.string().max(998),
  bodyHtml: z.string().max(2_000_000),
  attachments: z.array(
    z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(255),
      contentBase64: z.string().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3))
    })
  ),
  followUpAfterHours: z.number().positive().max(24 * 30).optional()
})
const scheduleSendSchema = sendMessageSchema.extend({
  sendAt: z.string().datetime(),
  timezone: z.string().min(1).max(100)
})
const snoozeSchema = z.object({
  messageId: z.string().uuid(),
  snoozeUntil: z.string().datetime()
})
const downloadAttachmentSchema = z.object({
  messageId: uuidSchema,
  attachmentIndex: z.number().int().min(0),
  destDir: z.string().min(1)
})
const createEventSchema = z.object({
  accountId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startTz: z.string().min(1),
  endTz: z.string().min(1),
  allDay: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
})
const updateEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  startTz: z.string().min(1).optional(),
  endTz: z.string().min(1).optional(),
  allDay: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
})
const updateAccountSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  imapHost: z.string().min(1).max(255).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecurity: securitySchema.optional(),
  smtpHost: z.string().min(1).max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecurity: securitySchema.optional()
})
const updateAccountWithIdSchema = updateAccountSchema.extend({ accountId: z.string().uuid() })
const updateCredentialSchema = z.object({
  accountId: z.string().uuid(),
  password: z.string().min(1).max(1024)
})
const setFlagsSchema = z.object({
  messageId: z.string().uuid(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional()
})
const setPinnedSchema = z.object({
  messageId: z.string().uuid(),
  pinned: z.boolean()
})
const moveMessageSchema = z.object({
  messageId: z.string().uuid(),
  destFolderId: z.string().uuid()
})
const searchMessagesSchema = z.object({
  accountId: z.string().uuid(),
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100).optional()
})
const createRuleSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(200),
  conditionField: z.enum(['from', 'subject']),
  conditionContains: z.string().min(1).max(200),
  actionMoveToFolderId: z.string().uuid()
})
const setRuleActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean()
})
const settingKeySchema = z.string().min(1).max(100)
const settingSetSchema = z.object({
  key: settingKeySchema,
  value: z.string().max(2000)
})

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC.accountsList,
    withErrorLogging(IPC.accountsList, () => listAccounts(getDb()))
  )

  ipcMain.handle(
    IPC.accountsCreate,
    withErrorLogging(IPC.accountsCreate, async (_event, rawInput: unknown) => {
      const input = createAccountSchema.parse(rawInput)
      const account = await createAccount(getDb(), input)
      // Rozpocznij synchronizację początkową (foldery i nagłówki) w tle,
      // a po utworzeniu folderów uruchom stały proces IDLE.
      syncAccount(getDb(), account.id)
        .catch((err) => log.error(`[account:create] initial sync error for ${account.id}:`, err))
        .finally(() => {
          idleManager.startAccount(account.id)
        })
      return account
    })
  )

  ipcMain.handle(
    IPC.accountsDelete,
    withErrorLogging(IPC.accountsDelete, async (_event, rawId: unknown) => {
      const id = deleteAccountSchema.parse(rawId)
      idleManager.stopAccount(id)
      await deleteAccount(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.accountsSetDefault,
    withErrorLogging(IPC.accountsSetDefault, async (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      setDefaultAccount(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.accountsUpdate,
    withErrorLogging(IPC.accountsUpdate, async (_event, rawInput: unknown) => {
      const { accountId, ...patch } = updateAccountWithIdSchema.parse(rawInput)
      const res = updateAccount(getDb(), accountId, patch)
      idleManager.startAccount(accountId)
      return res
    })
  )

  ipcMain.handle(
    IPC.accountsUpdateCredential,
    withErrorLogging(IPC.accountsUpdateCredential, async (_event, rawInput: unknown) => {
      const input = updateCredentialSchema.parse(rawInput)
      await updateAccountCredential(getDb(), input.accountId, input.password)
      idleManager.startAccount(input.accountId)
    })
  )

  ipcMain.handle(
    IPC.accountsTestConnection,
    withErrorLogging(IPC.accountsTestConnection, async (_event, rawInput: unknown) => {
      const input = testConnectionSchema.parse(rawInput)
      return runConnectionDiagnostics(input)
    })
  )

  ipcMain.handle(
    IPC.foldersList,
    withErrorLogging(IPC.foldersList, (_event, rawAccountId: unknown) => {
      const accountId = uuidSchema.parse(rawAccountId)
      return listFolders(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.syncAccount,
    withErrorLogging(IPC.syncAccount, (_event, rawAccountId: unknown) => {
      const accountId = uuidSchema.parse(rawAccountId)
      return syncAccount(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.syncFolder,
    withErrorLogging(IPC.syncFolder, (_event, rawInput: unknown) => {
      const input = syncFolderSchema.parse(rawInput)
      return syncSingleFolder(getDb(), input.accountId, input.folderId)
    })
  )

  ipcMain.handle(
    IPC.syncAllAccounts,
    withErrorLogging(IPC.syncAllAccounts, async () => {
      const db = getDb()
      const accounts = db.prepare('SELECT id FROM accounts ORDER BY created_at ASC').all() as { id: string }[]
      const results: import('@shared/ipc').SyncResult[] = []
      for (const { id } of accounts) {
        const result = await syncAccount(db, id)
        results.push(result)
      }
      return results
    })
  )

  ipcMain.handle(
    IPC.messagesList,
    withErrorLogging(IPC.messagesList, (_event, rawInput: unknown) => {
      const input = listMessagesSchema.parse(rawInput)
      return listMessages(getDb(), input.folderId, input.limit, input.offset, input.sortOrder)
    })
  )

  ipcMain.handle(
    IPC.messagesListUnified,
    withErrorLogging(IPC.messagesListUnified, (_event, rawInput: unknown) => {
      const input = listUnifiedMessagesSchema.parse(rawInput ?? {})
      return listUnifiedMessages(getDb(), input.limit, input.offset, input.sortOrder)
    })
  )

  ipcMain.handle(
    IPC.connectionStatus,
    withErrorLogging(IPC.connectionStatus, (_event, rawAccountId?: unknown) => {
      if (typeof rawAccountId === 'string' && rawAccountId) {
        return idleManager.getStatus(rawAccountId)
      }
      return idleManager.getAllStatuses()
    })
  )

  ipcMain.on(IPC.connectionOnline, () => {
    log.info('[ipc] odebrano connection:online — ponowne łączenie IDLE')
    idleManager.reconnectAll()
  })

  ipcMain.handle(
    IPC.messagesGetBody,
    withErrorLogging(IPC.messagesGetBody, (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      return getOrFetchMessageBody(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.messagesGetAttachments,
    withErrorLogging(IPC.messagesGetAttachments, async (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      const db = getDb()
      const ref = await getMessageImapRef(db, id)
      if (!ref) return []
      const info = await getAccountConnectionInfo(db, ref.accountId)
      const source = await fetchMessageSource(info, ref.folderImapPath, ref.uid, db)
      const parsed = await simpleParser(source)
      if (!parsed.attachments || parsed.attachments.length === 0) return []
      return parsed.attachments.map((att, idx) => ({
        id: `att-${id}-${idx}`,
        messageId: id,
        filename: att.filename || `attachment-${idx + 1}`,
        mimeType: att.contentType || 'application/octet-stream',
        sizeBytes: att.content?.length ?? 0,
        isInline: att.contentDisposition === 'inline',
        contentId: att.contentId ?? null,
        downloadedAt: null,
        localPath: null,
        position: idx
      }))
    })
  )

  ipcMain.handle(
    IPC.messagesDownloadAttachment,
    withErrorLogging(IPC.messagesDownloadAttachment, async (_event, rawInput: unknown) => {
      const input = downloadAttachmentSchema.parse(rawInput)
      const db = getDb()
      const ref = await getMessageImapRef(db, input.messageId)
      if (!ref) throw new Error('Nie znaleziono wiadomości')
      const info = await getAccountConnectionInfo(db, ref.accountId)
      const source = await fetchMessageSource(info, ref.folderImapPath, ref.uid, db)
      const parsed = await simpleParser(source)
      if (!parsed.attachments || input.attachmentIndex >= parsed.attachments.length) {
        throw new Error(`Załącznik ${input.attachmentIndex} nie istnieje`)
      }
      const att = parsed.attachments[input.attachmentIndex]
      if (!att.content) throw new Error('Nie można pobrać treści załącznika')
      const fileName = att.filename || `attachment-${input.attachmentIndex + 1}`
      const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      const localPath = join(input.destDir, safeName)
      await mkdir(input.destDir, { recursive: true })
      await writeFile(localPath, att.content)
      return { filename: safeName, localPath, sizeBytes: att.content.length }
    })
  )

  ipcMain.handle(
    IPC.messagesSend,
    withErrorLogging(IPC.messagesSend, async (_event, rawInput: unknown) => {
      const input = sendMessageSchema.parse(rawInput)
      await sendMessage(getDb(), input)
    })
  )

  ipcMain.handle(
    IPC.messagesSnooze,
    withErrorLogging(IPC.messagesSnooze, (_event, rawInput: unknown) => {
      const input = snoozeSchema.parse(rawInput)
      snoozeMessage(getDb(), input.messageId, input.snoozeUntil)
    })
  )

  ipcMain.handle(
    IPC.messagesSetFlags,
    withErrorLogging(IPC.messagesSetFlags, async (_event, rawInput: unknown) => {
      const input = setFlagsSchema.parse(rawInput)
      await setMessageFlags(getDb(), input.messageId, { isRead: input.isRead, isStarred: input.isStarred })
    })
  )

  ipcMain.handle(
    IPC.messagesSetPinned,
    withErrorLogging(IPC.messagesSetPinned, (_event, rawInput: unknown) => {
      const input = setPinnedSchema.parse(rawInput)
      updateMessagePinned(getDb(), input.messageId, input.pinned)
    })
  )

  ipcMain.handle(
    IPC.messagesMove,
    withErrorLogging(IPC.messagesMove, async (_event, rawInput: unknown) => {
      const input = moveMessageSchema.parse(rawInput)
      await moveMessage(getDb(), input.messageId, input.destFolderId)
    })
  )

  ipcMain.handle(
    IPC.messagesDelete,
    withErrorLogging(IPC.messagesDelete, async (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      await deleteMessagePermanently(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.messagesSearch,
    withErrorLogging(IPC.messagesSearch, (_event, rawInput: unknown) => {
      const input = searchMessagesSchema.parse(rawInput)
      return searchMessages(getDb(), input.accountId, input.query, input.limit)
    })
  )

  ipcMain.handle(
    IPC.rulesList,
    withErrorLogging(IPC.rulesList, (_event, rawAccountId: unknown) => {
      const accountId = uuidSchema.parse(rawAccountId)
      return listRules(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.rulesCreate,
    withErrorLogging(IPC.rulesCreate, (_event, rawInput: unknown) => {
      const input = createRuleSchema.parse(rawInput)
      return createRule(getDb(), input)
    })
  )

  ipcMain.handle(
    IPC.rulesSetActive,
    withErrorLogging(IPC.rulesSetActive, (_event, rawInput: unknown) => {
      const input = setRuleActiveSchema.parse(rawInput)
      setRuleActive(getDb(), input.id, input.isActive)
    })
  )

  ipcMain.handle(
    IPC.rulesDelete,
    withErrorLogging(IPC.rulesDelete, (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      deleteRule(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.settingsGet,
    withErrorLogging(IPC.settingsGet, (_event, rawKey: unknown) => {
      const key = settingKeySchema.parse(rawKey)
      return getSetting(getDb(), key)
    })
  )

  ipcMain.handle(
    IPC.settingsSet,
    withErrorLogging(IPC.settingsSet, (_event, rawInput: unknown) => {
      const input = settingSetSchema.parse(rawInput)
      setSetting(getDb(), input.key, input.value)
      if (input.key === 'app_language' && (input.value === 'pl' || input.value === 'en')) {
        updateTrayLanguage(input.value)
      }
    })
  )

  ipcMain.handle(
    IPC.scheduledSend,
    withErrorLogging(IPC.scheduledSend, (_event, rawInput: unknown) => {
      const input = scheduleSendSchema.parse(rawInput)
      return insertScheduled(getDb(), input)
    })
  )

  ipcMain.handle(
    IPC.scheduledList,
    withErrorLogging(IPC.scheduledList, () => listScheduled(getDb()))
  )

  ipcMain.handle(
    IPC.scheduledCancel,
    withErrorLogging(IPC.scheduledCancel, (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      cancelScheduled(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.snoozedList,
    withErrorLogging(IPC.snoozedList, () => listSnoozed(getDb()))
  )

  ipcMain.handle(
    IPC.followUpsList,
    withErrorLogging(IPC.followUpsList, () => listFollowUps(getDb()))
  )

  ipcMain.handle(
    IPC.followUpsCancel,
    withErrorLogging(IPC.followUpsCancel, (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      cancelFollowUp(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.attachmentsListAll,
    withErrorLogging(IPC.attachmentsListAll, (_event, rawAccountId: unknown) => {
      const accountId = uuidSchema.parse(rawAccountId)
      return listAttachmentsForAccount(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.bandwidthRecent,
    withErrorLogging(IPC.bandwidthRecent, (_event, rawAccountId: unknown) => {
      const accountId = uuidSchema.parse(rawAccountId)
      return listRecentBandwidth(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.filesPickSaveDirectory,
    withErrorLogging(IPC.filesPickSaveDirectory, async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    })
  )

  ipcMain.handle(
    IPC.calendarList,
    withErrorLogging(IPC.calendarList, (_event, rawAccountId: unknown) => {
      const accountId = uuidSchema.parse(rawAccountId)
      return listCalendarEvents(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.calendarCreate,
    withErrorLogging(IPC.calendarCreate, (_event, rawInput: unknown) => {
      const input = createEventSchema.parse(rawInput)
      return createCalendarEvent(getDb(), input)
    })
  )

  ipcMain.handle(
    IPC.calendarUpdate,
    withErrorLogging(IPC.calendarUpdate, (_event, rawInput: unknown) => {
      const input = updateEventSchema.parse(rawInput)
      updateCalendarEvent(getDb(), input)
    })
  )

  ipcMain.handle(
    IPC.calendarDelete,
    withErrorLogging(IPC.calendarDelete, (_event, rawId: unknown) => {
      const id = uuidSchema.parse(rawId)
      deleteCalendarEvent(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.filesPickAttachment,
    withErrorLogging(IPC.filesPickAttachment, async () => {
      const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
      if (result.canceled) return []
      return Promise.all(
        result.filePaths.map(async (filePath) => {
          const buf = await readFile(filePath)
          if (buf.length > MAX_ATTACHMENT_BYTES) {
            throw new Error(`Plik ${basename(filePath)} przekracza limit 25 MB`)
          }
          return {
            filename: basename(filePath),
            mimeType: MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
            contentBase64: buf.toString('base64'),
            sizeBytes: buf.length
          }
        })
      )
    })
  )

  ipcMain.handle(
    IPC.windowMinimize,
    withErrorLogging(IPC.windowMinimize, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.minimize()
    })
  )

  ipcMain.handle(
    IPC.windowMaximize,
    withErrorLogging(IPC.windowMaximize, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return false
      if (win.isMaximized()) {
        win.unmaximize()
        return false
      } else {
        win.maximize()
        return true
      }
    })
  )

  ipcMain.handle(
    IPC.windowClose,
    withErrorLogging(IPC.windowClose, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.close()
    })
  )

  ipcMain.handle(
    IPC.windowIsMaximized,
    withErrorLogging(IPC.windowIsMaximized, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return win?.isMaximized() ?? false
    })
  )

  // Labels IPC Handlers
  ipcMain.handle(
    IPC.labelsList,
    withErrorLogging(IPC.labelsList, (_event, accountId?: string) => {
      return listLabels(getDb(), accountId)
    })
  )

  ipcMain.handle(
    IPC.labelsCreate,
    withErrorLogging(IPC.labelsCreate, (_event, input: { name: string; color: string; accountId?: string | null }) => {
      return createLabel(getDb(), input.name, input.color, input.accountId)
    })
  )

  ipcMain.handle(
    IPC.labelsUpdate,
    withErrorLogging(IPC.labelsUpdate, (_event, input: { id: string; name: string; color: string }) => {
      return updateLabel(getDb(), input.id, input.name, input.color)
    })
  )

  ipcMain.handle(
    IPC.labelsDelete,
    withErrorLogging(IPC.labelsDelete, (_event, id: string) => {
      deleteLabel(getDb(), id)
    })
  )

  ipcMain.handle(
    IPC.labelsGetForMessage,
    withErrorLogging(IPC.labelsGetForMessage, (_event, messageId: string) => {
      return getLabelsForMessage(getDb(), messageId)
    })
  )

  ipcMain.handle(
    IPC.labelsAddToMessage,
    withErrorLogging(IPC.labelsAddToMessage, (_event, input: { messageId: string; labelId: string }) => {
      addLabelToMessage(getDb(), input.messageId, input.labelId)
    })
  )

  ipcMain.handle(
    IPC.labelsRemoveFromMessage,
    withErrorLogging(IPC.labelsRemoveFromMessage, (_event, input: { messageId: string; labelId: string }) => {
      removeLabelFromMessage(getDb(), input.messageId, input.labelId)
    })
  )

  ipcMain.handle(
    IPC.labelsListMessages,
    withErrorLogging(IPC.labelsListMessages, (_event, input: { labelId: string; limit?: number; offset?: number; sortOrder?: 'date_desc' | 'date_asc' | 'unread_first' }) => {
      return listMessagesByLabel(getDb(), input.labelId, input.limit, input.offset, input.sortOrder)
    })
  )
}
