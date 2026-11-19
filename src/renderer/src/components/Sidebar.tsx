import React, { useEffect, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useLabelsStore } from '../state/labels-store'
import { useSchedulerStore, type SpecialView } from '../state/scheduler-store'
import { useTranslation, getLocalizedLabelName } from '../i18n'
import { AddAccountDialog } from './AddAccountDialog'
import { LabelDialog } from './LabelDialog'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Icon, IconButton } from './ui/Button'
import type { AppView } from '../App'
import type { FolderSummary, LabelSummary } from '@shared/ipc'

interface SidebarProps {
  onOpenCompose?: () => void
  onOpenStats?: () => void
  currentView?: AppView
  onNavigateView?: (view: AppView) => void
}

const SYSTEM_FOLDERS: { type: FolderSummary['type']; icon: string; key: string }[] = [
  { type: 'inbox', icon: 'inbox', key: 'sidebar.folder.inbox' },
  { type: 'drafts', icon: 'draft', key: 'sidebar.folder.drafts' },
  { type: 'sent', icon: 'send', key: 'sidebar.folder.sent' },
  { type: 'archive', icon: 'archive', key: 'sidebar.folder.archive' },
  { type: 'spam', icon: 'report', key: 'sidebar.folder.spam' },
  { type: 'trash', icon: 'delete', key: 'sidebar.folder.trash' }
]

const LATER: { view: SpecialView; icon: string; key: string }[] = [
  { view: 'scheduled', icon: 'schedule_send', key: 'sidebar.folder.scheduled' },
  { view: 'snoozed', icon: 'snooze', key: 'sidebar.folder.snoozed' },
  { view: 'followups', icon: 'flag', key: 'sidebar.folder.followups' }
]

interface NavItemProps {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ReactNode
  count?: number
  /** Unread counts are emphasised; plain totals stay quiet. */
  countTone?: 'strong' | 'quiet'
  trailing?: React.ReactNode
  title?: string
  /** Context marker only (e.g. the account whose folders are shown) — no filled background. */
  soft?: boolean
}

function NavItem({ active, onClick, label, icon, count, countTone = 'quiet', trailing, title, soft = false }: NavItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={title}
      className={`group relative w-full h-[30px] flex items-center gap-2.5 pl-2.5 pr-2 rounded text-left text-sm transition-colors ${
        active && !soft ? 'bg-raised text-ink font-medium shadow-1' : active ? 'text-ink font-medium hover:bg-hover' : 'text-ink-2 hover:bg-hover hover:text-ink'
      }`}
    >
      {typeof icon === 'string' ? <Icon name={icon} className={active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2'} /> : icon}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
      {count !== undefined && count > 0 && (
        <span className={`tabular-nums text-xs ${countTone === 'strong' ? 'font-semibold text-accent-ink' : 'text-ink-3'}`}>{count}</span>
      )}
    </button>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <section className="mt-5 first:mt-0">
      <div className="h-6 flex items-center justify-between pl-2.5 pr-1 mb-0.5">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </section>
  )
}

export function Sidebar({ onOpenCompose, onOpenStats, currentView = 'mail', onNavigateView }: SidebarProps): JSX.Element {
  const { t } = useTranslation()
  const { accounts, selectedAccountId, load, select } = useAccountsStore()
  const { folders, selectedFolderId, selectFolder, loadFolders, selectUnifiedInbox, isUnifiedInbox, connectionState, syncing, syncAllAccounts, messages } =
    useMailStore()
  const { labels, selectedLabelId, loadLabels, selectLabel, deleteLabel } = useLabelsStore()
  const { view: specialView, showView, scheduled, snoozed, followUps } = useSchedulerStore()
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState<LabelSummary | null>(null)
  const [labelToDelete, setLabelToDelete] = useState<LabelSummary | null>(null)

  useEffect(() => {
    load()
    loadLabels()
  }, [load, loadLabels])

  useEffect(() => {
    if (selectedAccountId) loadFolders(selectedAccountId)
    else if (accounts.length > 0 && !isUnifiedInbox) selectUnifiedInbox()
  }, [selectedAccountId, accounts.length, loadFolders, selectUnifiedInbox, isUnifiedInbox])

  const inMail = currentView === 'mail' && specialView === 'none' && selectedLabelId === null
  const goMail = (): void => {
    onNavigateView?.('mail')
    showView('none')
  }

  const laterCount: Record<SpecialView, number> = { none: 0, scheduled: scheduled.length, snoozed: snoozed.length, followups: followUps.length }
  const activeAccount = accounts.find((a) => a.id === selectedAccountId)
  const accountFolders = isUnifiedInbox ? [] : folders
  const customFolders = accountFolders.filter((f) => f.type === 'custom')
  const unifiedUnread = isUnifiedInbox ? messages.filter((m) => !m.isRead).length : 0

  const statusLabel = syncing
    ? t('topbar.syncing')
    : connectionState === 'connected'
      ? t('sidebar.status.short_connected')
      : connectionState === 'connecting' || connectionState === 'reconnecting'
        ? t('sidebar.status.short_connecting')
        : connectionState === 'error'
          ? t('sidebar.status.short_error')
          : t('sidebar.status.short_idle')
  const statusDot =
    connectionState === 'error' ? 'bg-danger' : connectionState === 'connected' ? 'bg-ok' : syncing || connectionState !== 'idle' ? 'bg-warn' : 'bg-line-strong'

  return (
    <aside className="h-full flex flex-col min-h-0" aria-label={t('sidebar.nav_aria')}>
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onOpenCompose}
          className="w-full h-9 flex items-center gap-2 pl-3 pr-2 rounded bg-ink text-canvas text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Icon name="edit" />
          <span className="flex-1 text-left">{t('sidebar.compose')}</span>
          <kbd className="kbd !bg-transparent !text-canvas/70 !border-canvas/30">C</kbd>
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        <Section title={t('sidebar.accounts')} action={<IconButton icon="add" label={t('sidebar.add_account')} size="xs" onClick={() => setAccountDialogOpen(true)} />}>
          <NavItem
            active={inMail && isUnifiedInbox}
            icon="all_inbox"
            label={t('sidebar.all_inboxes')}
            count={unifiedUnread}
            countTone="strong"
            onClick={async () => {
              goMail()
              select(null)
              await selectUnifiedInbox()
            }}
          />
          {accounts.map((acc) => {
            const ok = acc.status === 'active'
            return (
              <NavItem
                key={acc.id}
                active={currentView === 'mail' && !isUnifiedInbox && selectedAccountId === acc.id}
                soft
                icon={<span className="w-[18px] flex justify-center"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: acc.color }} /></span>}
                label={acc.displayName || acc.email}
                title={acc.email}
                trailing={!ok ? <Icon name="error" className="!text-[15px] text-warn" /> : undefined}
                onClick={async () => {
                  goMail()
                  select(acc.id)
                  await loadFolders(acc.id, { forceInbox: true })
                }}
              />
            )
          })}
        </Section>

        {accountFolders.length > 0 && (
          <Section title={activeAccount?.displayName || activeAccount?.email || t('sidebar.folders')}>
            {SYSTEM_FOLDERS.map(({ type, icon, key }) => {
              const folder = accountFolders.find((f) => f.type === type)
              if (!folder) return null
              return (
                <NavItem
                  key={folder.id}
                  active={inMail && selectedFolderId === folder.id}
                  icon={icon}
                  label={t(key)}
                  count={type === 'inbox' || type === 'spam' || type === 'drafts' ? folder.unreadCount : undefined}
                  countTone={type === 'inbox' ? 'strong' : 'quiet'}
                  onClick={() => {
                    goMail()
                    selectFolder(folder.id)
                  }}
                />
              )
            })}
            {customFolders.map((f) => (
              <NavItem
                key={f.id}
                active={inMail && selectedFolderId === f.id}
                icon="folder"
                label={f.displayName}
                count={f.unreadCount}
                countTone="strong"
                onClick={() => {
                  goMail()
                  selectFolder(f.id)
                }}
              />
            ))}
          </Section>
        )}

        <Section title={t('sidebar.later')}>
          {LATER.map(({ view, icon, key }) => (
            <NavItem
              key={view}
              active={currentView === 'mail' && specialView === view}
              icon={icon}
              label={t(key)}
              count={laterCount[view]}
              onClick={() => {
                onNavigateView?.('mail')
                showView(view)
              }}
            />
          ))}
        </Section>

        <Section
          title={t('sidebar.labels')}
          action={
            <IconButton
              icon="add"
              label={t('sidebar.add_label')}
              size="xs"
              onClick={() => {
                setEditingLabel(null)
                setLabelDialogOpen(true)
              }}
            />
          }
        >
          {labels.length === 0 && <p className="pl-2.5 py-1 text-xs text-ink-3">{t('sidebar.labels_empty')}</p>}
          {labels.map((lbl) => (
            <div key={lbl.id} className="group relative">
              <NavItem
                active={currentView === 'mail' && specialView === 'none' && selectedLabelId === lbl.id}
                icon={<span className="w-[18px] flex justify-center"><span className="chip-dot" style={{ backgroundColor: lbl.color }} /></span>}
                label={getLocalizedLabelName(lbl, t)}
                count={lbl.unreadCount}
                countTone="strong"
                onClick={() => {
                  goMail()
                  selectLabel(lbl.id)
                }}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex group-focus-within:flex bg-raised rounded shadow-1">
                <IconButton
                  icon="edit"
                  label={t('common.edit')}
                  size="xs"
                  onClick={() => {
                    setEditingLabel(lbl)
                    setLabelDialogOpen(true)
                  }}
                />
                <IconButton icon="delete" label={t('common.delete')} size="xs" onClick={() => setLabelToDelete(lbl)} />
              </div>
            </div>
          ))}
        </Section>
      </nav>

      <div className="px-2 py-2 border-t border-line flex flex-col gap-px">
        <NavItem active={currentView === 'calendar'} icon="calendar_today" label={t('sidebar.tool.calendar')} onClick={() => onNavigateView?.('calendar')} />
        <NavItem active={currentView === 'files'} icon="attach_file" label={t('sidebar.tool.files')} onClick={() => onNavigateView?.('files')} />
        {onOpenStats && <NavItem active={false} icon="monitoring" label={t('sidebar.tool.stats')} onClick={onOpenStats} />}
        <NavItem active={currentView === 'settings'} icon="settings" label={t('sidebar.tool.settings')} onClick={() => onNavigateView?.('settings')} />
        <button
          type="button"
          onClick={() => syncAllAccounts()}
          disabled={syncing}
          title={t('sidebar.sync_now')}
          className="mt-1 h-7 flex items-center gap-2 pl-3 pr-2 rounded text-xs text-ink-3 hover:bg-hover hover:text-ink-2 disabled:cursor-default"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} aria-hidden="true" />
          <span className="flex-1 text-left truncate" aria-live="polite">
            {statusLabel}
          </span>
          <Icon name="sync" className={`!text-[15px] ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <AddAccountDialog open={accountDialogOpen} onClose={() => setAccountDialogOpen(false)} />
      <LabelDialog open={labelDialogOpen} onClose={() => setLabelDialogOpen(false)} editingLabel={editingLabel} />
      <ConfirmDialog
        open={labelToDelete !== null}
        onClose={() => setLabelToDelete(null)}
        onConfirm={async () => {
          if (labelToDelete) await deleteLabel(labelToDelete.id)
        }}
        title={t('labels.dialog.delete_title')}
        description={labelToDelete ? t('labels.dialog.delete_confirm', { name: labelToDelete.name }) : undefined}
        confirmLabel={t('common.delete')}
        danger
      />
    </aside>
  )
}
