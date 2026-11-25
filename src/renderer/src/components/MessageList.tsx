import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMailStore, type MessageFilterTab, type MessageSortOrder } from '../state/mail-store'
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
import { Button, Icon, IconButton } from './ui/Button'
import { groupByDay, type DayBucket } from '../utils/date-groups'
import { canUsePlainShortcut, hasShortcutOverlay, isTypingTarget } from '../utils/keyboard'
import type { MessageListItem } from '@shared/ipc'

interface MessageListProps {
  onOpenThreadDossier?: () => void
}

const FILTERS: MessageFilterTab[] = ['all', 'unread', 'starred', 'attachments']
const SORTS: MessageSortOrder[] = ['date_desc', 'date_asc', 'unread_first']

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
    sortOrder,
    setFilterTab,
    setSortOrder,
    setSearchQuery,
    selectMessage,
    selectFolder,
    setMessageFlags,
    togglePinned,
    moveMessage,
    deleteMessage,
    retryCurrentFolder,
    refreshCurrentFolder
  } = useMailStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const specialView = useSchedulerStore((s) => s.view)
  const { labels, toggleMessageLabel } = useLabelsStore()
  const { t, formatDate, formatRelativeDate } = useTranslation()

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MessageListItem | null>(null)
  const [propertiesMessage, setPropertiesMessage] = useState<MessageListItem | null>(null)
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const activeFolder = folders.find((f) => f.id === selectedFolderId)
  const trashFolder = folders.find((f) => f.type === 'trash')
  const archiveFolder = folders.find((f) => f.type === 'archive')
  const isTrash = activeFolder?.type === 'trash'

  const folderLabel = (type: string, fallback: string): string =>
    ['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'].includes(type) ? t(`sidebar.folder.${type}`) : fallback

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return messages.filter((m) => {
      if (q && ![m.fromName, m.fromAddr, m.subject, m.snippet].some((v) => (v || '').toLowerCase().includes(q))) return false
      if (filterTab === 'unread' && m.isRead) return false
      if (filterTab === 'starred' && !m.isStarred) return false
      if (filterTab === 'attachments' && !m.hasAttachments) return false
      return true
    })
  }, [messages, searchQuery, filterTab])

  const pinned = filteredMessages.filter((m) => m.isPinned)
  const rest = filteredMessages.filter((m) => !m.isPinned)
  const groups: { key: string; title: string; items: MessageListItem[] }[] = [
    ...(pinned.length ? [{ key: 'pinned', title: t('messageList.group.pinned'), items: pinned }] : []),
    ...(sortOrder === 'unread_first'
      ? rest.length
        ? [{ key: 'all', title: '', items: rest }]
        : []
      : groupByDay(rest, (m) => m.dateReceived).map((g, i) => ({ key: `${g.bucket}-${i}`, title: t(`messageList.group.${g.bucket as DayBucket}`), items: g.items })))
  ]
  const ordered = groups.flatMap((g) => g.items)

  const trash = (m: MessageListItem): void => {
    if (isTrash) setDeleteTarget(m)
    else moveMessage(m.id, trashFolder?.id ?? m.folderId).catch(() => {})
  }

  async function snooze(messageId: string, hours: number): Promise<void> {
    await window.mailapp.messages.snooze(messageId, new Date(Date.now() + hours * 3600_000).toISOString())
    if (selectedFolderId) await selectFolder(selectedFolderId)
    else await refreshCurrentFolder()
  }

  const snoozeItems = (m: MessageListItem): ContextMenuItem[] =>
    (
      [
        ['1h', 1],
        ['evening', 6],
        ['tomorrow', 24],
        ['next_week', 24 * 7]
      ] as const
    ).map(([k, h]) => ({ key: `snooze-${k}`, label: t(`messageList.snooze.${k}`), icon: 'schedule', onSelect: () => snooze(m.id, h) }))

  function buildContextMenuItems(m: MessageListItem): ContextMenuItem[] {
    const otherFolders = folders.filter((f) => f.id !== m.folderId)
    return [
      { key: 'open', label: t('messageList.ctx.open'), icon: 'mail', onSelect: () => selectMessage(m.id) },
      {
        key: 'open-thread',
        label: t('messageList.ctx.open_thread'),
        icon: 'forum',
        disabled: !onOpenThreadDossier,
        onSelect: () => {
          selectMessage(m.id)
          onOpenThreadDossier?.()
        }
      },
      { key: 'div-1', label: '', divider: true },
      {
        key: 'toggle-read',
        label: m.isRead ? t('messageList.ctx.mark_unread') : t('messageList.ctx.mark_read'),
        icon: m.isRead ? 'mark_email_unread' : 'drafts',
        onSelect: () => setMessageFlags(m.id, { isRead: !m.isRead })
      },
      { key: 'toggle-star', label: m.isStarred ? t('messageList.ctx.unstar') : t('messageList.ctx.star'), icon: 'star', onSelect: () => setMessageFlags(m.id, { isStarred: !m.isStarred }) },
      { key: 'toggle-pin', label: m.isPinned ? t('messageList.ctx.unpin') : t('messageList.ctx.pin'), icon: 'keep', onSelect: () => togglePinned(m.id) },
      { key: 'snooze', label: t('messageList.snooze_title'), icon: 'snooze', submenu: snoozeItems(m) },
      { key: 'div-2', label: '', divider: true },
      {
        key: 'move',
        label: t('messageList.ctx.move'),
        icon: 'drive_file_move',
        disabled: otherFolders.length === 0,
        submenu: otherFolders.map((f) => ({ key: `move-${f.id}`, label: folderLabel(f.type, f.displayName), icon: 'folder', onSelect: () => moveMessage(m.id, f.id) }))
      },
      {
        key: 'labels-menu',
        label: t('messageList.ctx.labels'),
        icon: 'label',
        disabled: labels.length === 0,
        submenu: labels.map((lbl) => ({
          key: `label-${lbl.id}`,
          label: getLocalizedLabelName(lbl, t),
          icon: (m.labels || []).some((l) => l.id === lbl.id) ? 'check' : undefined,
          onSelect: () => toggleMessageLabel(m.id, lbl)
        }))
      },
      { key: 'properties', label: t('messageList.ctx.properties'), icon: 'info', onSelect: () => setPropertiesMessage(m) },
      { key: 'div-3', label: '', divider: true },
      { key: 'delete', label: isTrash ? t('messageList.ctx.delete_permanent') : t('messageList.ctx.delete'), icon: 'delete', danger: true, onSelect: () => trash(m) }
    ]
  }

  // Keyboard triage follows the order shown in the focused message list.
  const onListKeyDown = (e: React.KeyboardEvent): void => {
    if (!canUsePlainShortcut(e.nativeEvent) || isTypingTarget(e.target) || hasShortcutOverlay() || ordered.length === 0) return
    if (e.shiftKey && e.key !== '#') return
    const idx = ordered.findIndex((m) => m.id === selectedMessageId)
    const current = ordered[idx]
    const go = (i: number): void => {
      const next = ordered[Math.max(0, Math.min(ordered.length - 1, i))]
      selectMessage(next.id)
      document.getElementById(`msg-${next.id}`)?.scrollIntoView({ block: 'nearest' })
    }
    switch (e.key.toLowerCase()) {
      case 'arrowdown':
      case 'j':
        go(idx + 1)
        break
      case 'arrowup':
      case 'k':
        go(idx < 0 ? 0 : idx - 1)
        break
      case 'home':
        go(0)
        break
      case 'end':
        go(ordered.length - 1)
        break
      case 's':
        if (!e.repeat && current) setMessageFlags(current.id, { isStarred: !current.isStarred })
        break
      case 'u':
        if (!e.repeat && current) setMessageFlags(current.id, { isRead: !current.isRead })
        break
      case 'p':
        if (!e.repeat && current) togglePinned(current.id)
        break
      case 'e':
        if (!e.repeat && current && archiveFolder && current.folderId !== archiveFolder.id) moveMessage(current.id, archiveFolder.id)
        break
      case 'delete':
      case '#':
        if (!e.repeat && current) trash(current)
        break
      default:
        return
    }
    e.preventDefault()
  }

  useEffect(() => {
    if (selectedMessageId) document.getElementById(`msg-${selectedMessageId}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedMessageId])

  if (specialView !== 'none') return <SpecialLists />

  if (!selectedFolderId && !selectedLabelId) {
    return <EmptyState icon="folder_open" title={t('messageList.empty.select_folder')} description={t('messageList.empty.select_folder_desc')} />
  }

  const selectedLabel = labels.find((l) => l.id === selectedLabelId)
  const unreadCount = messages.filter((m) => !m.isRead).length
  const title = selectedLabel
    ? getLocalizedLabelName(selectedLabel, t)
    : isUnifiedInbox
      ? t('sidebar.all_inboxes')
      : activeFolder
        ? folderLabel(activeFolder.type, activeFolder.displayName)
        : t('messageList.tab.all')

  const accountOf = (m: MessageListItem): string =>
    accounts.find((a) => a.id === m.accountId)?.displayName || m.accountEmail || ''

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-baseline gap-2 min-w-0">
          {selectedLabel && <span className="chip-dot self-center" style={{ backgroundColor: selectedLabel.color }} />}
          <h1 className="font-semibold tracking-[-0.015em] text-xl text-ink truncate">{title}</h1>
          <span className="text-md text-ink-3 tabular-nums whitespace-nowrap">
            {searchQuery ? t('messageList.results_count', { count: filteredMessages.length }) : unreadCount > 0 ? t('messageList.unread_count', { count: unreadCount }) : messages.length}
          </span>
          <span className="flex-1" />
          <IconButton icon="refresh" label={t('common.refresh')} size="sm" loading={syncing} onClick={() => refreshCurrentFolder()} />
          <IconButton
            icon="sort"
            label={`${t('messageList.sort_label')}: ${t(`messageList.sort.${sortOrder}`)}`}
            size="sm"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenu({
                x: r.right - 220,
                y: r.bottom + 4,
                items: SORTS.map((s) => ({ key: s, label: t(`messageList.sort.${s}`), icon: s === sortOrder ? 'check' : undefined, onSelect: () => {
                  setSortOrder(s)
                  window.mailapp.settings.set('sortOrder', s).catch(() => {})
                }
              }))
              })
            }}
          />
        </div>
        <div className="segmented mt-3 w-full [&>button]:flex-1 [&>button]:px-1.5 [&>button]:whitespace-normal [&>button]:leading-tight [&>button]:h-auto [&>button]:min-h-[28px]" role="group" aria-label={t('messageList.filter_label')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filterTab === f} onClick={() => setFilterTab(f)}>
              {t(`topbar.filter_${f}`)}
            </button>
          ))}
        </div>
      </header>

      {syncError && (
        <div role="alert" className="flex items-center gap-2 px-4 py-2 text-xs bg-warn-soft text-warn border-b border-line">
          <Icon name="cloud_off" className="!text-[16px]" />
          <span className="flex-1 truncate" title={syncError}>
            {syncError}
          </span>
          <Button size="xs" variant="secondary" onClick={() => retryCurrentFolder()}>
            {t('messageList.sync_retry')}
          </Button>
        </div>
      )}

      {isTrash && messages.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-ink-2 border-b border-line bg-sunken/50">
          <span className="flex-1">{t('messageList.trash_alert_desc')}</span>
          <Button size="xs" variant="danger-ghost" icon="delete_forever" loading={bulkBusy} onClick={() => setEmptyTrashConfirmOpen(true)}>
            {t('messageList.empty_trash_btn')}
          </Button>
        </div>
      )}

      <div
        id="mail-message-list"
        ref={listRef}
        className="flex-1 overflow-y-auto focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
        role="listbox"
        aria-label={title}
        aria-activedescendant={selectedMessageId ? `msg-${selectedMessageId}` : undefined}
        tabIndex={0}
        onKeyDown={onListKeyDown}
      >
        {loadingMessages ? (
          <div className="px-4" aria-busy="true">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="py-3 border-b border-line flex flex-col gap-2">
                <div className="flex justify-between">
                  <Skeleton width="35%" />
                  <Skeleton width={40} />
                </div>
                <Skeleton width="75%" />
                <Skeleton width="90%" height={10} />
              </div>
            ))}
          </div>
        ) : filteredMessages.length === 0 ? (
          syncError ? (
            <EmptyState
              icon="sync_problem"
              tone="danger"
              title={t('messageList.empty.connection_error')}
              description={t('messageList.empty.connection_error_desc', { error: syncError })}
              action={
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => retryCurrentFolder()}>
                  {t('messageList.empty.retry')}
                </Button>
              }
            />
          ) : searchQuery || filterTab !== 'all' ? (
            <EmptyState
              icon="search_off"
              title={t('messageList.empty.no_search')}
              description={searchQuery ? t('messageList.empty.no_search_desc', { query: searchQuery }) : t('messageList.empty.no_filter_desc')}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setFilterTab('all')
                  }}
                >
                  {t('messageList.empty.clear_search')}
                </Button>
              }
            />
          ) : selectedLabelId ? (
            <EmptyState icon="label" title={t('messageList.empty.label')} description={t('messageList.empty.label_desc')} />
          ) : (
            <EmptyState icon="done_all" title={t('messageList.empty.inbox_zero')} description={t('messageList.empty.inbox_zero_desc')} />
          )
        ) : (
          groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.title || undefined}>
              {g.title && (
                <div className="sticky top-0 z-[1] px-5 pt-4 pb-1.5 bg-panel eyebrow" aria-hidden="true">
                  {g.title}
                </div>
              )}
              {g.items.map((m) => {
                const selected = selectedMessageId === m.id
                const sender = m.fromName || m.fromAddr
                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    role="option"
                    aria-selected={selected}
                    data-testid="message-row"
                    onClick={() => {
                      selectMessage(m.id)
                      listRef.current?.focus({ preventScroll: true })
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, items: buildContextMenuItems(m) })
                    }}
                    className={`message-list-row group relative mx-2 pl-6 pr-3 rounded-lg cursor-default transition-colors ${
                      selected ? 'bg-selected' : 'hover:bg-hover'
                    }`}
                  >
                    {!m.isRead && <span className="message-list-unread absolute left-2.5 w-[7px] h-[7px] rounded-full bg-flag" role="img" aria-label={t('messageList.props.status_unread')} />}

                    <div className="flex items-center gap-2">
                      <span className={`truncate text-md ${m.isRead ? 'text-ink' : 'text-ink font-semibold'}`}>{sender}</span>
                      {m.threadCount > 1 && <span className="flex-shrink-0 px-1.5 h-[18px] leading-[18px] rounded-md bg-sunken text-2xs text-ink-2 tabular-nums">{m.threadCount}</span>}
                      <span className="flex-1" />
                      <span className="flex items-center gap-1 text-ink-3 group-hover:invisible group-focus-within:invisible">
                        {m.hasAttachments && <Icon name="attach_file" className="!text-[14px]" />}
                        {m.isStarred && <Icon name="star" fill className="!text-[14px] text-warn" />}
                        <time className={`text-sm tabular-nums whitespace-nowrap ${m.isRead ? '' : 'text-ink font-medium'}`} dateTime={m.dateReceived ?? undefined}>
                          {formatRelativeDate(m.dateReceived)}
                        </time>
                      </span>
                    </div>

                    <p className="truncate text-md mt-0.5">
                      <span className={m.isRead ? 'text-ink-2' : 'text-ink font-medium'}>{m.subject || t('messageList.no_subject')}</span>
                      {m.snippet && <span className="ml-2 text-ink-3">{m.snippet}</span>}
                    </p>

                    {((isUnifiedInbox && m.accountEmail) || (m.labels && m.labels.length > 0)) && (
                      <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                        {isUnifiedInbox && m.accountEmail && (
                          <span className="chip" title={m.accountEmail}>
                            <span className="chip-dot" style={{ backgroundColor: m.accountColor }} />
                            {accountOf(m)}
                          </span>
                        )}
                        {m.labels?.map((lbl) => (
                          <span key={lbl.id} className="chip">
                            <span className="chip-dot" style={{ backgroundColor: lbl.color }} />
                            {getLocalizedLabelName(lbl, t)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Hover actions replace the meta column; also reachable via context menu and keyboard. */}
                    <div className="message-list-actions absolute right-2 hidden group-hover:flex group-focus-within:flex bg-raised rounded shadow-2 p-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        size="sm"
                        icon={<Icon name="star" fill={m.isStarred} className={m.isStarred ? 'text-warn' : ''} />}
                        label={m.isStarred ? t('messageList.remove_star') : t('messageList.add_star')}
                        shortcut="S"
                        data-testid={`star-button-${m.id}`}
                        onClick={() => setMessageFlags(m.id, { isStarred: !m.isStarred })}
                      />
                      <IconButton
                        size="sm"
                        icon={m.isRead ? 'mark_email_unread' : 'drafts'}
                        label={m.isRead ? t('messageList.ctx.mark_unread') : t('messageList.ctx.mark_read')}
                        shortcut="U"
                        onClick={() => setMessageFlags(m.id, { isRead: !m.isRead })}
                      />
                      <IconButton
                        size="sm"
                        icon="snooze"
                        label={t('messageList.snooze_title')}
                        onClick={(e) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setMenu({ x: r.left, y: r.bottom + 4, items: snoozeItems(m) })
                        }}
                      />
                      <IconButton size="sm" icon="delete" label={isTrash ? t('messageList.ctx.delete_permanent') : t('messageList.ctx.delete')} shortcut="Del" onClick={() => trash(m)} />
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

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

      <ConfirmDialog
        open={emptyTrashConfirmOpen}
        onClose={() => setEmptyTrashConfirmOpen(false)}
        onConfirm={async () => {
          setBulkBusy(true)
          try {
            for (const m of messages) await deleteMessage(m.id).catch(() => {})
          } finally {
            setBulkBusy(false)
          }
        }}
        title={t('messageList.confirm.empty_trash_title')}
        description={messages.length === 1 ? t('messageList.confirm.empty_trash_desc_single') : t('messageList.confirm.empty_trash_desc_multi', { count: messages.length })}
        confirmLabel={t('messageList.confirm.empty_trash_confirm')}
        danger
      />

      <Modal open={propertiesMessage !== null} onClose={() => setPropertiesMessage(null)} size="sm" title={t('messageList.props.title')}>
        {propertiesMessage && (
          <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-2.5 text-sm">
            {[
              [t('messageList.props.subject'), propertiesMessage.subject || t('messageList.no_subject')],
              [t('messageList.props.from'), `${propertiesMessage.fromName || propertiesMessage.fromAddr} <${propertiesMessage.fromAddr}>`],
              [t('messageList.props.account'), accounts.find((a) => a.id === propertiesMessage.accountId)?.email || propertiesMessage.accountId],
              [
                t('messageList.props.folder'),
                folderLabel(folders.find((f) => f.id === propertiesMessage.folderId)?.type ?? '', folders.find((f) => f.id === propertiesMessage.folderId)?.displayName ?? '-')
              ],
              [t('messageList.props.date'), propertiesMessage.dateReceived ? formatDate(propertiesMessage.dateReceived) : '-'],
              [
                t('messageList.props.thread'),
                propertiesMessage.threadCount > 1 ? t('messageList.props.thread_multi', { count: propertiesMessage.threadCount }) : t('messageList.props.thread_single')
              ],
              [
                t('messageList.props.status'),
                [
                  propertiesMessage.isRead ? t('messageList.props.status_read') : t('messageList.props.status_unread'),
                  propertiesMessage.isStarred ? t('messageList.props.status_starred') : null,
                  propertiesMessage.isPinned ? t('messageList.props.status_pinned') : null
                ]
                  .filter(Boolean)
                  .join(', ')
              ],
              [t('messageList.props.attachments'), propertiesMessage.hasAttachments ? t('messageList.props.attachments_yes') : t('messageList.props.attachments_no')],
              [t('messageList.props.id'), <code key="id" className="font-mono text-xs">{propertiesMessage.id}</code>]
            ].map(([label, value]) => (
              <React.Fragment key={String(label)}>
                <dt className="text-ink-3">{label}</dt>
                <dd className="text-ink break-all">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </Modal>
    </div>
  )
}
