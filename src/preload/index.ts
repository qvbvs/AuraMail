import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AccountSummary,
  AccountConnectionStatus,
  CreateAccountInput,
  FolderSummary,
  FollowUpSummary,
  MessageDetail,
  MessageListItem,
  PickedFile,
  ScheduledMessageSummary,
  ScheduleSendInput,
  SendMessageInput,
  SnoozedMessageSummary,
  SyncResult,
  TestConnectionInput,
  TestConnectionStep,
  AttachmentSummary,
  AttachmentDownloadResult,
  AttachmentWithMessage,
  BandwidthPoint,
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  UpdateAccountInput,
  SetMessageFlagsInput,
  MessageSearchInput,
  MailRule,
  CreateMailRuleInput,
  LabelSummary,
  CreateLabelInput,
  UpdateLabelInput
} from '@shared/ipc'

const api = {
  accounts: {
    list: (): Promise<AccountSummary[]> => ipcRenderer.invoke(IPC.accountsList),
    create: (input: CreateAccountInput): Promise<AccountSummary> => ipcRenderer.invoke(IPC.accountsCreate, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.accountsDelete, id),
    setDefault: (id: string): Promise<void> => ipcRenderer.invoke(IPC.accountsSetDefault, id),
    update: (accountId: string, patch: UpdateAccountInput): Promise<AccountSummary> =>
      ipcRenderer.invoke(IPC.accountsUpdate, { accountId, ...patch }),
    updateCredential: (accountId: string, password: string): Promise<void> =>
      ipcRenderer.invoke(IPC.accountsUpdateCredential, { accountId, password }),
    testConnection: (input: TestConnectionInput): Promise<TestConnectionStep[]> =>
      ipcRenderer.invoke(IPC.accountsTestConnection, input)
  },
  folders: {
    list: (accountId: string): Promise<FolderSummary[]> => ipcRenderer.invoke(IPC.foldersList, accountId)
  },
  sync: {
    account: (accountId: string): Promise<SyncResult> => ipcRenderer.invoke(IPC.syncAccount, accountId),
    folder: (accountId: string, folderId: string): Promise<{ count: number; error: string | null }> =>
      ipcRenderer.invoke(IPC.syncFolder, { accountId, folderId }),
    allAccounts: (): Promise<SyncResult[]> => ipcRenderer.invoke(IPC.syncAllAccounts),
    getStatus: (accountId?: string): Promise<AccountConnectionStatus | AccountConnectionStatus[]> =>
      ipcRenderer.invoke(IPC.connectionStatus, accountId),
    notifyOnline: (): void => ipcRenderer.send(IPC.connectionOnline),
    onAutoSyncCompleted: (cb: (results: SyncResult[]) => void) => {
      const handler = (_event: unknown, results: SyncResult[]): void => cb(results)
      ipcRenderer.on('sync:auto-completed', handler)
      return () => {
        ipcRenderer.removeListener('sync:auto-completed', handler)
      }
    },
    onStatusChange: (cb: (status: AccountConnectionStatus) => void) => {
      const handler = (_event: unknown, status: AccountConnectionStatus): void => cb(status)
      ipcRenderer.on('connection:status', handler)
      return () => {
        ipcRenderer.removeListener('connection:status', handler)
      }
    },
    onNewMessage: (cb: (data: { accountId: string; folderId: string; message: MessageListItem }) => void) => {
      const handler = (_event: unknown, data: { accountId: string; folderId: string; message: MessageListItem }): void => cb(data)
      ipcRenderer.on('sync:new-message', handler)
      return () => {
        ipcRenderer.removeListener('sync:new-message', handler)
      }
    },
    onMessageUpdated: (cb: (data: { accountId: string; folderId: string; uid: number }) => void) => {
      const handler = (_event: unknown, data: { accountId: string; folderId: string; uid: number }): void => cb(data)
      ipcRenderer.on('sync:message-updated', handler)
      return () => {
        ipcRenderer.removeListener('sync:message-updated', handler)
      }
    },
    onSoundTriggered: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('notify:sound', handler)
      return () => {
        ipcRenderer.removeListener('notify:sound', handler)
      }
    },
    onOpenMessageFromNotification: (cb: (data: { accountId: string; folderId: string; messageId: string }) => void) => {
      const handler = (_event: unknown, data: { accountId: string; folderId: string; messageId: string }): void => cb(data)
      ipcRenderer.on('notification:open-message', handler)
      return () => {
        ipcRenderer.removeListener('notification:open-message', handler)
      }
    }
  },
  messages: {
    list: (folderId: string, limit?: number, offset?: number, sortOrder?: 'date_desc' | 'date_asc' | 'unread_first'): Promise<MessageListItem[]> =>
      ipcRenderer.invoke(IPC.messagesList, { folderId, limit, offset, sortOrder }),
    listUnified: (limit?: number, offset?: number, sortOrder?: 'date_desc' | 'date_asc' | 'unread_first'): Promise<MessageListItem[]> =>
      ipcRenderer.invoke(IPC.messagesListUnified, { limit, offset, sortOrder }),
    getBody: (id: string): Promise<MessageDetail> => ipcRenderer.invoke(IPC.messagesGetBody, id),
    getAttachments: (messageId: string): Promise<AttachmentSummary[]> =>
      ipcRenderer.invoke(IPC.messagesGetAttachments, messageId),
    downloadAttachment: (messageId: string, index: number, destDir: string): Promise<AttachmentDownloadResult> =>
      ipcRenderer.invoke(IPC.messagesDownloadAttachment, { messageId, attachmentIndex: index, destDir }),
    send: (input: SendMessageInput): Promise<void> => ipcRenderer.invoke(IPC.messagesSend, input),
    snooze: (messageId: string, snoozeUntil: string): Promise<void> =>
      ipcRenderer.invoke(IPC.messagesSnooze, { messageId, snoozeUntil }),
    setFlags: (messageId: string, flags: SetMessageFlagsInput): Promise<void> =>
      ipcRenderer.invoke(IPC.messagesSetFlags, { messageId, ...flags }),
    setPinned: (messageId: string, pinned: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.messagesSetPinned, { messageId, pinned }),
    move: (messageId: string, destFolderId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.messagesMove, { messageId, destFolderId }),
    delete: (messageId: string): Promise<void> => ipcRenderer.invoke(IPC.messagesDelete, messageId),
    search: (input: MessageSearchInput): Promise<MessageListItem[]> => ipcRenderer.invoke(IPC.messagesSearch, input)
  },
  files: {
    pickAttachment: (): Promise<PickedFile[]> => ipcRenderer.invoke(IPC.filesPickAttachment),
    pickSaveDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.filesPickSaveDirectory)
  },
  attachments: {
    listAll: (accountId: string): Promise<AttachmentWithMessage[]> =>
      ipcRenderer.invoke(IPC.attachmentsListAll, accountId)
  },
  bandwidth: {
    recent: (accountId: string): Promise<BandwidthPoint[]> => ipcRenderer.invoke(IPC.bandwidthRecent, accountId)
  },
  rules: {
    list: (accountId: string): Promise<MailRule[]> => ipcRenderer.invoke(IPC.rulesList, accountId),
    create: (input: CreateMailRuleInput): Promise<MailRule> => ipcRenderer.invoke(IPC.rulesCreate, input),
    setActive: (id: string, isActive: boolean): Promise<void> => ipcRenderer.invoke(IPC.rulesSetActive, { id, isActive }),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.rulesDelete, id)
  },
  labels: {
    list: (accountId?: string): Promise<LabelSummary[]> => ipcRenderer.invoke(IPC.labelsList, accountId),
    create: (input: CreateLabelInput): Promise<LabelSummary> => ipcRenderer.invoke(IPC.labelsCreate, input),
    update: (input: UpdateLabelInput): Promise<LabelSummary> => ipcRenderer.invoke(IPC.labelsUpdate, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.labelsDelete, id),
    getForMessage: (messageId: string): Promise<LabelSummary[]> => ipcRenderer.invoke(IPC.labelsGetForMessage, messageId),
    addToMessage: (messageId: string, labelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.labelsAddToMessage, { messageId, labelId }),
    removeFromMessage: (messageId: string, labelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.labelsRemoveFromMessage, { messageId, labelId }),
    listMessages: (labelId: string, limit?: number, offset?: number, sortOrder?: 'date_desc' | 'date_asc' | 'unread_first'): Promise<MessageListItem[]> =>
      ipcRenderer.invoke(IPC.labelsListMessages, { labelId, limit, offset, sortOrder })
  },
  settings: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke(IPC.settingsGet, key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke(IPC.settingsSet, { key, value })
  },
  calendar: {
    list: (accountId: string): Promise<CalendarEvent[]> => ipcRenderer.invoke(IPC.calendarList, accountId),
    create: (input: CreateCalendarEventInput & { accountId: string }): Promise<{ id: string }> =>
      ipcRenderer.invoke(IPC.calendarCreate, input),
    update: (id: string, patch: UpdateCalendarEventInput): Promise<void> =>
      ipcRenderer.invoke(IPC.calendarUpdate, { id, ...patch }),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.calendarDelete, id)
  },
  scheduled: {
    send: (input: ScheduleSendInput): Promise<string> => ipcRenderer.invoke(IPC.scheduledSend, input),
    list: (): Promise<ScheduledMessageSummary[]> => ipcRenderer.invoke(IPC.scheduledList),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.scheduledCancel, id)
  },
  snoozed: {
    list: (): Promise<SnoozedMessageSummary[]> => ipcRenderer.invoke(IPC.snoozedList)
  },
  followUps: {
    list: (): Promise<FollowUpSummary[]> => ipcRenderer.invoke(IPC.followUpsList),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.followUpsCancel, id)
  },
  tray: {
    onComposeNew: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('tray:compose-new', handler)
      return () => {
        ipcRenderer.removeListener('tray:compose-new', handler)
      }
    },
    onGoInbox: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('tray:go-inbox', handler)
      return () => {
        ipcRenderer.removeListener('tray:go-inbox', handler)
      }
    },
    onFocusSearch: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('tray:focus-search', handler)
      return () => {
        ipcRenderer.removeListener('tray:focus-search', handler)
      }
    },
    onOpenSettings: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('tray:open-settings', handler)
      return () => {
        ipcRenderer.removeListener('tray:open-settings', handler)
      }
    }
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.windowMinimize),
    maximize: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowMaximize),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.windowClose),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.windowIsMaximized),
    onMaximizeChange: (cb: (isMaximized: boolean) => void) => {
      const handler = (_event: unknown, isMaximized: boolean): void => cb(isMaximized)
      ipcRenderer.on('window:maximize-change', handler)
      return () => {
        ipcRenderer.removeListener('window:maximize-change', handler)
      }
    },
    onFocusChange: (cb: (isFocused: boolean) => void) => {
      const handler = (_event: unknown, isFocused: boolean): void => cb(isFocused)
      ipcRenderer.on('window:focus-change', handler)
      return () => {
        ipcRenderer.removeListener('window:focus-change', handler)
      }
    }
  }
}

export type AuraMailApi = typeof api
export type MailAppApi = AuraMailApi

contextBridge.exposeInMainWorld('auramail', api)
contextBridge.exposeInMainWorld('mailapp', api)
