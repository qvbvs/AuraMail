import React, { useMemo, useState } from 'react'
import {
  ClockRegular
} from '@fluentui/react-icons'
import { useMailStore } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useSchedulerStore } from '../state/scheduler-store'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation, getLocalizedLabelName } from '../i18n'
import { SpecialLists } from './SpecialLists'
import { Skeleton } from './ui/Skeleton'
import { EmptyState } from './ui/EmptyState'
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Modal } from './ui/Modal'
import type { MessageListItem } from '@shared/ipc'

const AVATAR_COLORS = [
  'bg-indigo-600 text-white',
  'bg-blue-600 text-white',
  'bg-teal-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-purple-600 text-white',
  'bg-pink-600 text-white'
]

function getAvatarColorClass(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

interface MessageListProps {
  onOpenThreadDossier?: () => void
}

export function MessageList({ onOpenThreadDossier }: MessageListProps): JSX.Element {
  const {
    messages,
    selectedMessageId,
    selectedFolderId,
    selectedLabelId,
    isUnifiedInbox,
    folders,
    loadingMessages,
    syncing,
    syncError,
    searchQuery,
    filterTab,
    setSearchQuery,
    selectMessage,
    selectFolder,
    setMessageFlags,
    togglePinned,
    moveMessage,
    deleteMessage,
    retryCurrentFolder
  } = useMailStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const specialView = useSchedulerStore((s) => s.view)
  const { labels, toggleMessageLabel } = useLabelsStore()
  const { t, formatDate, formatRelativeDate } = useTranslation()

  const getFolderLabel = (type: string, fallback: string): string => {
    switch (type) {
      case 'inbox': return t('sidebar.folder.inbox')
      case 'sent': return t('sidebar.folder.sent')
      case 'drafts': return t('sidebar.folder.drafts')
      case 'archive': return t('sidebar.folder.archive')
      case 'spam': return t('sidebar.folder.spam')
      case 'trash': return t('sidebar.folder.trash')
      default: return fallback
    }
  }

  const SNOOZE_OPTIONS: { label: string; hours: number }[] = [
    { label: t('messageList.snooze.1h'), hours: 1 },
    { label: t('messageList.snooze.evening'), hours: 6 },
    { label: t('messageList.snooze.tomorrow'), hours: 24 },
    { label: t('messageList.snooze.next_week'), hours: 24 * 7 }
  ]

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: MessageListItem } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MessageListItem | null>(null)
  const [propertiesMessage, setPropertiesMessage] = useState<MessageListItem | null>(null)
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const trashFolder = folders.find((f) => f.type === 'trash')

function IconDrafts(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 12V7l-9.5 5.5L2.5 7v5" />
      <path d="M21.5 12a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2" />
      <path d="M2.5 7a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2" />
      <path d="M2.5 12l4 3.5m15-3.5l-4 3.5" />
    </svg>
  )
}

function IconOpenInNew(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function IconMarkRead(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      <polyline points="16 19 18 21 22 17" />
    </svg>
  )
}

function IconMarkUnread(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-primary dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      <circle cx="18" cy="7" r="2.5" fill="#4f46e5" stroke="none" />
    </svg>
  )
}

function IconStarOutline(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconStarFilled(): JSX.Element {
  return (
    <svg className="w-4 h-4 fill-amber-400 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

function IconPin(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}

function IconPinOff(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-primary dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12" />
      <path d="M15 9.34V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1" />
    </svg>
  )
}

function IconMove(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="m12 11 3 3-3 3" />
      <path d="M9 14h6" />
    </svg>
  )
}

function IconFolder(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

function IconTrash(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-rose-500 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconInfo(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

  function buildContextMenuItems(m: MessageListItem): ContextMenuItem[] {
    const otherFolders = folders.filter((f) => f.id !== m.folderId)
    const isInTrash = activeFolder?.type === 'trash'

    return [
      {
        key: 'open',
        label: t('messageList.ctx.open'),
        icon: <IconDrafts />,
        onSelect: () => selectMessage(m.id)
      },
      {
        key: 'open-thread',
        label: t('messageList.ctx.open_thread'),
        icon: <IconOpenInNew />,
        disabled: !onOpenThreadDossier,
        onSelect: () => {
          selectMessage(m.id)
          onOpenThreadDossier?.()
        }
      },
      { key: 'div-status', label: '', divider: true },
      {
        key: 'toggle-read',
        label: m.isRead ? t('messageList.ctx.mark_unread') : t('messageList.ctx.mark_read'),
        icon: m.isRead ? <IconMarkUnread /> : <IconMarkRead />,
        onSelect: () => setMessageFlags(m.id, { isRead: !m.isRead })
      },
      {
        key: 'toggle-star',
        label: m.isStarred ? t('messageList.ctx.unstar') : t('messageList.ctx.star'),
        icon: m.isStarred ? <IconStarFilled /> : <IconStarOutline />,
        onSelect: () => setMessageFlags(m.id, { isStarred: !m.isStarred })
      },
      {
        key: 'toggle-pin',
        label: m.isPinned ? t('messageList.ctx.unpin') : t('messageList.ctx.pin'),
        icon: m.isPinned ? <IconPinOff /> : <IconPin />,
        onSelect: () => togglePinned(m.id)
      },
      { key: 'div-org', label: '', divider: true },
      {
        key: 'move',
        label: t('messageList.ctx.move'),
        icon: <IconMove />,
        disabled: otherFolders.length === 0,
        submenu: otherFolders.map((f) => ({
          key: `move-${f.id}`,
          label: getFolderLabel(f.type, f.displayName),
          icon: <IconFolder />,
          onSelect: () => moveMessage(m.id, f.id)
        }))
      },
      {
        key: 'labels-menu',
        label: t('sidebar.labels', undefined, 'Etykiety...'),
        icon: <span className="material-symbols-outlined text-[16px]">label</span>,
        disabled: labels.length === 0,
        submenu: labels.map((lbl) => {
          const isAssigned = (m.labels || []).some((l) => l.id === lbl.id)
          return {
            key: `label-${lbl.id}`,
            label: `${isAssigned ? '✓ ' : '   '}${getLocalizedLabelName(lbl, t)}`,
            onSelect: () => toggleMessageLabel(m.id, lbl)
          }
        })
      },
      { key: 'div-danger', label: '', divider: true },
      {
        key: 'delete',
        label: isInTrash ? t('messageList.ctx.delete_permanent') : t('messageList.ctx.delete'),
        icon: <IconTrash />,
        danger: true,
        onSelect: () => {
          if (isInTrash) {
            setDeleteTarget(m)
          } else {
            moveMessage(m.id, trashFolder?.id ?? m.folderId).catch(() => {})
          }
        }
      },
      {
        key: 'properties',
        label: t('messageList.ctx.properties'),
        icon: <IconInfo />,
        onSelect: () => setPropertiesMessage(m)
      }
    ]
  }

  const activeFolder = folders.find((f) => f.id === selectedFolderId)

  // Filter messages based on search query and active filter tab
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesSender = (m.fromName || '').toLowerCase().includes(q) || (m.fromAddr || '').toLowerCase().includes(q)
        const matchesSubject = (m.subject || '').toLowerCase().includes(q)
        const matchesSnippet = (m.snippet || '').toLowerCase().includes(q)
        if (!matchesSender && !matchesSubject && !matchesSnippet) return false
      }

      // Tab filter
      if (filterTab === 'unread' && m.isRead) return false
      if (filterTab === 'starred' && !m.isStarred) return false
      if (filterTab === 'attachments' && !m.hasAttachments) return false

      return true
    })
  }, [messages, searchQuery, filterTab])

  if (specialView !== 'none') {
    return <SpecialLists />
  }

  async function snooze(messageId: string, hours: number): Promise<void> {
    const until = new Date(Date.now() + hours * 3600_000).toISOString()
    await window.mailapp.messages.snooze(messageId, until)
    if (selectedFolderId) await selectFolder(selectedFolderId)
  }

  if (!selectedFolderId && !selectedLabelId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50/50 dark:bg-[#0f1522]">
        <EmptyState
          icon={<span className="material-symbols-outlined text-[32px]">folder_open</span>}
          title={t('messageList.empty.select_folder')}
          description={t('messageList.empty.select_folder_desc')}
        />
      </div>
    )
  }

  const selectedLabel = labels.find((l) => l.id === selectedLabelId)
  const unreadCount = messages.filter((m) => !m.isRead).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/70 dark:bg-[#0f1522] border-r border-slate-200/80 dark:border-white/[0.06]">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-[#121826]/80 backdrop-blur-md flex flex-col gap-1 z-10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-headline text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
              {selectedLabel ? (
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs" style={{ backgroundColor: selectedLabel.color }} />
                  <span>{getLocalizedLabelName(selectedLabel, t)}</span>
                </span>
              ) : isUnifiedInbox
                ? t('sidebar.all_inboxes', undefined, 'Wszystkie skrzynki')
                : activeFolder
                ? getFolderLabel(activeFolder.type, activeFolder.displayName)
                : t('messageList.tab.all', undefined, 'Wiadomości')}
            </h2>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/60 dark:border-slate-700/60 flex-shrink-0">
              {messages.length}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-primary dark:text-indigo-300 font-semibold border border-indigo-200/50 dark:border-indigo-900/40">
                {t('messageList.unread_count', { count: unreadCount })}
              </span>
            )}

            {searchQuery && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-primary text-white font-medium">
                {t('messageList.results_count', { count: filteredMessages.length })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Syncing or Error Banners */}
      {syncing && (
        <div className="px-4 py-1.5 bg-indigo-50/90 dark:bg-indigo-950/50 border-b border-indigo-100 dark:border-indigo-900/30 flex items-center gap-2 text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
          <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
          <span>{t('messageList.syncing_banner')}</span>
        </div>
      )}

      {syncError && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200/70 dark:border-amber-900/40 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-amber-600 flex-shrink-0">cloud_off</span>
            <span className="truncate text-[11px]">{syncError}</span>
          </div>
          <button
            type="button"
            onClick={() => retryCurrentFolder()}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shadow-2xs flex-shrink-0 transition-colors cursor-pointer"
          >
            {t('messageList.sync_retry')}
          </button>
        </div>
      )}

      {/* Trash Alert Strip */}
      {activeFolder?.type === 'trash' && messages.length > 0 && (
        <div className="p-space-md bg-surface-container-low/80 dark:bg-slate-900/80 border-b border-border-subtle dark:border-white/[0.06] select-none">
          <div className="flex flex-col gap-space-xs bg-surface-container-lowest dark:bg-[#121826] p-space-md rounded-xl shadow-sm border border-border-subtle dark:border-white/[0.04]">
            <div className="flex items-center gap-space-sm min-w-0">
              <div className="w-8 h-8 rounded-full bg-error-container dark:bg-rose-950/80 text-on-error-container dark:text-rose-300 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-title-sm text-caption text-on-surface dark:text-white font-bold">{t('messageList.trash_alert_title')}</span>
                <p className="font-body-sm text-[11px] text-on-surface-variant dark:text-text-muted line-clamp-1">
                  {t('messageList.trash_alert_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-space-xs pt-1">
              <button
                type="button"
                onClick={() => setEmptyTrashConfirmOpen(true)}
                disabled={bulkBusy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-error-container dark:bg-rose-950 text-on-error-container dark:text-rose-300 hover:bg-error hover:text-white transition-all font-title-sm text-[11px] font-semibold shadow-xs disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">delete_forever</span>
                <span>{bulkBusy ? t('messageList.empty_trash_busy') : t('messageList.empty_trash_btn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
        {loadingMessages ? (
          // Shimmer loading skeletons
          <div className="p-3 flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-xl bg-white dark:bg-[#121826] border border-slate-100 dark:border-white/[0.04]"
              >
                <Skeleton variant="avatar" />
                <div className="flex-1">
                  <div className="flex justify-between mb-2">
                    <Skeleton width="40%" height={12} />
                    <Skeleton width="20%" height={10} />
                  </div>
                  <Skeleton width="80%" height={14} className="mb-2" />
                  <Skeleton width="100%" height={10} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMessages.length === 0 ? (
          syncError ? (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[32px] text-amber-600">sync_problem</span>}
              title={t('messageList.empty.connection_error')}
              description={t('messageList.empty.connection_error_desc', { error: syncError })}
              action={
                <button
                  type="button"
                  onClick={() => retryCurrentFolder()}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>{t('messageList.empty.retry')}</span>
                </button>
              }
            />
          ) : searchQuery ? (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[32px]">search_off</span>}
              title={t('messageList.empty.no_search')}
              description={t('messageList.empty.no_search_desc', { query: searchQuery })}
              action={
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {t('messageList.empty.clear_search')}
                </button>
              }
            />
          ) : selectedLabelId ? (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[32px] text-indigo-500">label</span>}
              title={t('messageList.empty.label', undefined, 'Brak wiadomości z tą etykietą')}
              description={t('messageList.empty.label_desc', undefined, 'Żadna wiadomość nie została jeszcze oznaczona tą etykietą.')}
            />
          ) : (
            <EmptyState
              variant="inbox-zero"
              title={t('messageList.empty.inbox_zero', undefined, 'Wszystko przeczytane!')}
              description={t('messageList.empty.inbox_zero_desc', undefined, 'Brak oczekujących wiadomości w tym folderze. Osiągnąłeś stan Inbox Zero. Świetna robota!')}
              showShortcuts={true}
            />
          )
        ) : (
          filteredMessages.map((m) => {
            const isSelected = selectedMessageId === m.id
            const senderName = m.fromName || m.fromAddr
            const avatarColor = getAvatarColorClass(senderName)
            const initials = senderName.slice(0, 2).toUpperCase()

            return (
              <div
                key={m.id}
                data-testid="message-row"
                onClick={() => selectMessage(m.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, message: m })
                }}
                className={`group relative flex items-start gap-3 p-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-white dark:bg-[#192336] shadow-sm z-10'
                    : !m.isRead
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-white/90 dark:hover:bg-[#161f2e]'
                    : 'bg-transparent hover:bg-white/70 dark:hover:bg-[#141b2a]'
                }`}
              >
                {/* Active Left Accent Bar */}
                {isSelected && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary rounded-r" />
                )}

                {/* Sender Avatar */}
                <div
                  className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-xs mt-0.5`}
                >
                  {initials}
                </div>

                {/* Content Column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
                    {!m.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                    <span
                      className={`truncate text-xs ${
                        m.isRead
                          ? 'font-medium text-slate-700 dark:text-slate-300'
                          : 'font-bold text-slate-900 dark:text-white'
                      }`}
                    >
                      {senderName}
                    </span>
                  </div>

                  {/* Subject */}
                  <div
                    className={`text-xs truncate mb-1 ${
                      m.isRead
                        ? 'font-normal text-slate-800 dark:text-slate-200'
                        : 'font-semibold text-slate-900 dark:text-white'
                    }`}
                  >
                    {m.subject || t('messageList.no_subject')}
                    {m.threadCount > 1 && (
                      <span className="ml-1.5 font-mono text-[10px] text-slate-400 font-normal">
                        ({m.threadCount})
                      </span>
                    )}
                  </div>

                  {/* Snippet */}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {m.snippet || ' '}
                  </div>

                  {/* Badges row */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {isUnifiedInbox && m.accountEmail && (
                      <span
                        className="inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5 rounded-full border text-slate-700 dark:text-slate-300"
                        style={{
                          borderColor: (m.accountColor || '#6366f1') + '60',
                          backgroundColor: (m.accountColor || '#6366f1') + '18'
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: m.accountColor || '#6366f1' }}
                        />
                        <span className="truncate max-w-[120px]">{m.accountEmail}</span>
                      </span>
                    )}
                    {m.hasAttachments && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700/50">
                        <span className="material-symbols-outlined text-[12px]">attachment</span>
                        <span>{t('messageList.attachment_badge')}</span>
                      </span>
                    )}
                    {m.isPinned && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-primary dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-200/40 dark:border-indigo-900/40">
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>keep</span>
                      </span>
                    )}
                    {/* Etykiety wiadomości */}
                    {m.labels && m.labels.length > 0 && m.labels.map((lbl) => (
                      <span
                        key={lbl.id}
                        className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold px-2 py-0.5 rounded-full border shadow-2xs"
                        style={{
                          borderColor: lbl.color + '55',
                          backgroundColor: lbl.color + '15',
                          color: lbl.color
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: lbl.color }}
                        />
                        <span className="truncate max-w-[100px]">{getLocalizedLabelName(lbl, t)}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right corner: Date, Star & Quick actions */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0 self-start mt-0.5 ml-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 select-none">
                      {formatRelativeDate(m.dateReceived)}
                    </span>

                    {/* Star Button (Ulubione) */}
                    <button
                      type="button"
                      data-testid={`star-button-${m.id}`}
                      aria-label={m.isStarred ? t('messageList.remove_star') : t('messageList.add_star')}
                      title={m.isStarred ? t('messageList.remove_star') : t('messageList.add_star')}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setMessageFlags(m.id, { isStarred: !m.isStarred })
                      }}
                      className={`p-1 -mr-1 rounded-md transition-all duration-150 flex items-center justify-center focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400/80 active:scale-75 cursor-pointer ${
                        m.isStarred
                          ? 'text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 opacity-100'
                          : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {m.isStarred ? (
                        <svg
                          className="w-4 h-4 fill-amber-400 text-amber-500 transition-transform duration-150 hover:scale-110 drop-shadow-xs"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4 transition-transform duration-150 hover:scale-110"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Snooze menu (widoczne przy hover na wierszu) */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="snooze-menu relative" onClick={(e) => e.stopPropagation()}>
                      <details className="group/snooze">
                        <summary
                          className="list-none cursor-pointer flex items-center p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={t('messageList.snooze_title')}
                        >
                          <ClockRegular fontSize={14} />
                        </summary>
                        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-xl z-50 min-w-[130px] p-1 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
                          {SNOOZE_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1a2333] rounded-lg transition-colors"
                              onClick={() => snooze(m.id, opt.hours)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Context Menu (PPM) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.message)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Trwałe usunięcie pojedynczej wiadomości z Kosza */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteMessage(deleteTarget.id).catch(() => {})
        }}
        title={t('messageList.confirm.delete_single_title')}
        description={deleteTarget ? t('messageList.confirm.delete_single_desc', { subject: deleteTarget.subject || t('messageList.no_subject') }) : undefined}
        confirmLabel={t('messageList.confirm.delete_single_confirm')}
        danger
      />

      {/* Opróżnienie całego Kosza */}
      <ConfirmDialog
        open={emptyTrashConfirmOpen}
        onClose={() => setEmptyTrashConfirmOpen(false)}
        onConfirm={async () => {
          setBulkBusy(true)
          try {
            for (const m of messages) {
              await deleteMessage(m.id).catch(() => {})
            }
          } finally {
            setBulkBusy(false)
          }
        }}
        title={t('messageList.confirm.empty_trash_title')}
        description={messages.length === 1 ? t('messageList.confirm.empty_trash_desc_single') : t('messageList.confirm.empty_trash_desc_multi', { count: messages.length })}
        confirmLabel={t('messageList.confirm.empty_trash_confirm')}
        danger
      />

      {/* Właściwości wiadomości */}
      <Modal
        open={propertiesMessage !== null}
        onClose={() => setPropertiesMessage(null)}
        size="sm"
        title={t('messageList.props.title')}
      >
        {propertiesMessage && (
          <dl className="text-xs space-y-2">
            {[
              [t('messageList.props.subject'), propertiesMessage.subject || t('messageList.no_subject')],
              [t('messageList.props.from'), `${propertiesMessage.fromName || propertiesMessage.fromAddr} <${propertiesMessage.fromAddr}>`],
              [t('messageList.props.account'), accounts.find((a) => a.id === propertiesMessage.accountId)?.email || propertiesMessage.accountId],
              [t('messageList.props.folder'), getFolderLabel(folders.find((f) => f.id === propertiesMessage.folderId)?.type ?? '', folders.find((f) => f.id === propertiesMessage.folderId)?.displayName ?? '—')],
              [t('messageList.props.date'), propertiesMessage.dateReceived ? formatDate(propertiesMessage.dateReceived) : '—'],
              [t('messageList.props.thread'), propertiesMessage.threadId ? t('messageList.props.thread_multi', { count: propertiesMessage.threadCount }) : t('messageList.props.thread_single')],
              [t('messageList.props.status'), [propertiesMessage.isRead ? t('messageList.props.status_read') : t('messageList.props.status_unread'), propertiesMessage.isStarred ? t('messageList.props.status_starred') : null, propertiesMessage.isPinned ? t('messageList.props.status_pinned') : null].filter(Boolean).join(', ')],
              [t('messageList.props.attachments'), propertiesMessage.hasAttachments ? t('messageList.props.attachments_yes') : t('messageList.props.attachments_no')],
              [t('messageList.props.id'), propertiesMessage.id]
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-32 flex-shrink-0 text-slate-400 dark:text-slate-500 uppercase text-[10px] font-bold pt-0.5">{label}</dt>
                <dd className="text-slate-800 dark:text-slate-200 break-all">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </div>
  )
}
