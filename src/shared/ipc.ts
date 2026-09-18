// Kontrakt IPC main<->renderer. Renderer nigdy nie woła ipcRenderer.invoke bezpośrednio
// z dowolnym kanałem — jedynie przez wąskie funkcje z contextBridge (patrz preload/index.ts).
// Każdy kanał ma jawny typ żądania/odpowiedzi, walidowany po stronie main przez zod.

export type AccountSecurity = 'none' | 'ssl' | 'starttls'
export type AccountAuthType = 'password' | 'oauth2_google' | 'oauth2_microsoft'
export type AccountStatus = 'active' | 'error' | 'disabled'

export interface AccountSummary {
  id: string
  email: string
  displayName: string
  imapHost: string
  imapPort: number
  imapSecurity: AccountSecurity
  smtpHost: string
  smtpPort: number
  smtpSecurity: AccountSecurity
  authType: AccountAuthType
  isDefault: boolean
  color: string
  status: AccountStatus
  lastError: string | null
  createdAt: string
}

export interface CreateAccountInput {
  email: string
  displayName: string
  imapHost: string
  imapPort: number
  imapSecurity: AccountSecurity
  smtpHost: string
  smtpPort: number
  smtpSecurity: AccountSecurity
  authType: AccountAuthType
  password: string
  color: string
}

export interface TestConnectionStep {
  step: 'dns' | 'tcp' | 'tls' | 'auth'
  ok: boolean
  message: string
}

export interface TestConnectionInput {
  host: string
  port: number
  security: AccountSecurity
  protocol: 'imap' | 'smtp'
  email: string
  password: string
}

export type FolderType = 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash' | 'custom'

export interface FolderSummary {
  id: string
  accountId: string
  displayName: string
  type: FolderType
  unreadCount: number
}

export interface MessageListItem {
  id: string
  accountId: string
  folderId: string
  threadId: string | null
  subject: string
  fromAddr: string
  fromName: string
  snippet: string
  dateReceived: string | null
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  isPinned: boolean
  hasAttachments: boolean
  threadCount: number
  accountEmail?: string
  accountColor?: string
  labels?: LabelSummary[]
}

export interface LabelSummary {
  id: string
  name: string
  color: string
  accountId: string | null
  messageCount: number
  unreadCount: number
}

export interface CreateLabelInput {
  name: string
  color: string
  accountId?: string | null
}

export interface UpdateLabelInput {
  id: string
  name: string
  color: string
}

export interface SetMessageFlagsInput {
  isRead?: boolean
  isStarred?: boolean
}

export interface UpdateAccountInput {
  displayName?: string
  imapHost?: string
  imapPort?: number
  imapSecurity?: AccountSecurity
  smtpHost?: string
  smtpPort?: number
  smtpSecurity?: AccountSecurity
}

export interface UpdateAccountCredentialInput {
  password: string
}

export type MailRuleConditionField = 'from' | 'subject'

export interface MailRule {
  id: string
  accountId: string
  name: string
  conditionField: MailRuleConditionField
  conditionContains: string
  actionMoveToFolderId: string
  isActive: boolean
}

export interface CreateMailRuleInput {
  accountId: string
  name: string
  conditionField: MailRuleConditionField
  conditionContains: string
  actionMoveToFolderId: string
}

export interface MessageSearchInput {
  accountId: string
  query: string
  limit?: number
}

export interface MessageDetail extends MessageListItem {
  toJson: string
  ccJson: string
  bccJson: string
  bodyHtml: string | null
  bodyPlain: string | null
}

export interface ComposeAttachment {
  filename: string
  mimeType: string
  contentBase64: string
}

export interface SendMessageInput {
  accountId: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string
  attachments: ComposeAttachment[]
  /** Godzin do przypomnienia, jeśli brak odpowiedzi (plan 7.15/20) — brak = bez follow-upu. */
  followUpAfterHours?: number
}

export type ScheduledStatus = 'pending' | 'sent' | 'failed' | 'cancelled'

export interface ScheduleSendInput extends SendMessageInput {
  sendAt: string
  timezone: string
}

export interface ScheduledMessageSummary {
  id: string
  accountId: string
  to: string[]
  subject: string
  sendAt: string
  status: ScheduledStatus
  lastError: string | null
}

export interface SnoozedMessageSummary extends MessageListItem {
  snoozeUntil: string
}

export type FollowUpStatus = 'pending' | 'resolved' | 'cancelled'

export interface FollowUpSummary {
  id: string
  subject: string
  toAddr: string
  sentAt: string | null
  remindAfter: string
  status: FollowUpStatus
}

export interface AttachmentSummary {
  id: string
  messageId: string
  filename: string
  mimeType: string
  sizeBytes: number
  isInline: boolean
  contentId: string | null
  downloadedAt: string | null
  localPath: string | null
  /** Pozycja w drzewie MIME wiadomości — indeks do przekazania w messages:downloadAttachment. */
  position: number
}

export interface AttachmentWithMessage extends AttachmentSummary {
  senderName: string
  senderEmail: string
  dateReceived: string | null
  subject: string
}

export interface PickedFile {
  filename: string
  mimeType: string
  contentBase64: string
  sizeBytes: number
}

export interface AttachmentDownloadResult {
  filename: string
  localPath: string
  sizeBytes: number
}

export type BandwidthOperation = 'sync' | 'send'

export interface BandwidthPoint {
  timestamp: string
  bytesTransferred: number
  durationMs: number
  kbps: number
  operation: BandwidthOperation
}

export interface SyncResult {
  accountId: string
  newMessages: number
  status: AccountStatus
  error: string | null
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startTz: string
  endTz: string
  allDay: boolean
  color: string
  createdAt: string
  updatedAt: string
}

export interface CreateCalendarEventInput {
  title: string
  description?: string
  startTz: string
  endTz: string
  allDay?: boolean
  color?: string
}

export interface UpdateCalendarEventInput {
  title?: string
  description?: string
  startTz?: string
  endTz?: string
  allDay?: boolean
  color?: string
}

export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'error' | 'idle'

export interface AccountConnectionStatus {
  accountId: string
  state: ConnectionState
  lastError: string | null
  lastSyncedAt: string | null
  idling: boolean
}

export const IPC = {
  accountsList: 'accounts:list',
  accountsCreate: 'accounts:create',
  accountsDelete: 'accounts:delete',
  accountsSetDefault: 'accounts:setDefault',
  accountsUpdate: 'accounts:update',
  accountsUpdateCredential: 'accounts:updateCredential',
  accountsTestConnection: 'accounts:testConnection',
  foldersList: 'folders:list',
  syncAccount: 'sync:account',
  syncFolder: 'sync:folder',
  syncAllAccounts: 'sync:allAccounts',
  messagesList: 'messages:list',
  messagesListUnified: 'messages:listUnified',
  messagesGetBody: 'messages:getBody',
  messagesSend: 'messages:send',
  messagesSnooze: 'messages:snooze',
  messagesSetFlags: 'messages:setFlags',
  messagesSetPinned: 'messages:setPinned',
  messagesMove: 'messages:move',
  messagesDelete: 'messages:delete',
  messagesSearch: 'messages:search',
  messagesGetAttachments: 'messages:getAttachments',
  messagesDownloadAttachment: 'messages:downloadAttachment',
  filesPickAttachment: 'files:pickAttachment',
  filesPickSaveDirectory: 'files:pickSaveDirectory',
  attachmentsListAll: 'attachments:listAll',
  bandwidthRecent: 'bandwidth:recent',
  calendarList: 'calendar:list',
  calendarCreate: 'calendar:create',
  calendarUpdate: 'calendar:update',
  calendarDelete: 'calendar:delete',
  rulesList: 'rules:list',
  rulesCreate: 'rules:create',
  rulesSetActive: 'rules:setActive',
  rulesDelete: 'rules:delete',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  scheduledSend: 'scheduled:send',
  scheduledList: 'scheduled:list',
  scheduledCancel: 'scheduled:cancel',
  snoozedList: 'snoozed:list',
  followUpsList: 'followUps:list',
  followUpsCancel: 'followUps:cancel',
  connectionStatus: 'connection:status',
  connectionOnline: 'connection:online',
  labelsList: 'labels:list',
  labelsCreate: 'labels:create',
  labelsUpdate: 'labels:update',
  labelsDelete: 'labels:delete',
  labelsGetForMessage: 'labels:getForMessage',
  labelsAddToMessage: 'labels:addToMessage',
  labelsRemoveFromMessage: 'labels:removeFromMessage',
  labelsListMessages: 'labels:listMessages',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:isMaximized'
} as const

