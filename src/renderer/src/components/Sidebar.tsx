import React, { useEffect, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useLabelsStore } from '../state/labels-store'
import { useSchedulerStore, type SpecialView } from '../state/scheduler-store'
import { useTranslation, getLocalizedLabelName } from '../i18n'
import { AddAccountDialog } from './AddAccountDialog'
import { LabelDialog } from './LabelDialog'
import type { LabelSummary } from '@shared/ipc'

interface SidebarProps {
  onOpenCompose?: () => void
  currentView?: string
  onNavigateView?: (view: 'mail' | 'thread-dossier' | 'settings' | 'calendar' | 'files') => void
}

export function Sidebar({ onOpenCompose, currentView = 'mail', onNavigateView }: SidebarProps): JSX.Element {
  const { t } = useTranslation()
  const { accounts, selectedAccountId, load, select } = useAccountsStore()
  const {
    folders,
    selectedFolderId,
    selectFolder,
    loadFolders,
    selectUnifiedInbox,
    isUnifiedInbox,
    connectionState,
    syncAllAccounts,
    messages
  } = useMailStore()
  const {
    labels,
    selectedLabelId,
    loadLabels,
    selectLabel,
    deleteLabel
  } = useLabelsStore()
  const { view: specialView, showView, scheduled, snoozed, followUps } = useSchedulerStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [labelDialogOpen, setLabelDialogOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState<LabelSummary | null>(null)

  useEffect(() => {
    load()
    loadLabels()
  }, [load, loadLabels])

  useEffect(() => {
    if (selectedAccountId) {
      loadFolders(selectedAccountId)
    } else if (accounts.length > 0 && !isUnifiedInbox) {
      selectUnifiedInbox()
    }
  }, [selectedAccountId, accounts.length, loadFolders, selectUnifiedInbox, isUnifiedInbox])

  const getSpecialCount = (key: SpecialView): number => {
    if (key === 'scheduled') return scheduled.length
    if (key === 'snoozed') return snoozed.length
    if (key === 'followups') return followUps.length
    return 0
  }

  const inboxFolder = folders.find((f) => f.type === 'inbox')
  const draftsFolder = folders.find((f) => f.type === 'drafts')
  const sentFolder = folders.find((f) => f.type === 'sent')
  const archiveFolder = folders.find((f) => f.type === 'archive')
  const spamFolder = folders.find((f) => f.type === 'spam')
  const trashFolder = folders.find((f) => f.type === 'trash')
  const customFolders = folders.filter(
    (f) => !['inbox', 'drafts', 'sent', 'archive', 'spam', 'trash'].includes(f.type)
  )

  const unreadInboxCount = isUnifiedInbox
    ? messages.filter((m) => !m.isRead).length
    : (inboxFolder?.unreadCount ?? 0)

  return (
    <aside className="h-full flex flex-col px-space-md py-space-md select-none overflow-y-auto">
      {/* Compose Button (Aura CTA) */}
      <div className="mb-space-lg">
        <button
          onClick={onOpenCompose}
          className="w-full flex items-center justify-center gap-space-sm bg-primary-container dark:bg-gradient-to-r dark:from-indigo-600 dark:to-indigo-500 text-white py-2.5 px-space-md rounded-xl shadow-[0_1px_3px_0_rgba(79,70,229,0.3)] hover:bg-primary dark:hover:from-indigo-500 dark:hover:to-indigo-400 hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] transition-all font-title-sm text-title-sm border border-transparent dark:border-indigo-400/20 active:scale-[0.99]"
        >
          <span className="material-symbols-outlined text-[18px]">edit_square</span>
          <span className="font-semibold">{t('sidebar.compose')}</span>
          <span className="ml-auto font-label-mono text-caption opacity-80 bg-white/20 px-1.5 py-0.5 rounded">
            C
          </span>
        </button>
      </div>

      {/* Accounts Section */}
      <div className="mb-space-lg">
        <div className="px-space-sm mb-space-xs flex items-center justify-between">
          <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">
            {t('sidebar.accounts')}
          </span>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white p-0.5 rounded transition-colors"
            title={t('sidebar.add_account')}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {/* Unified "Wszystkie skrzynki" item */}
          <button
            type="button"
            onClick={async () => {
              onNavigateView?.('mail')
              showView('none')
              select(null)
              await selectUnifiedInbox()
            }}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'mail' && specialView === 'none' && selectedLabelId === null && isUnifiedInbox
                ? 'bg-surface-container-highest dark:bg-surface-elevated text-on-surface dark:text-white font-semibold shadow-sm'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm min-w-0">
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
              <span className="truncate font-body-sm text-body-sm">{t('sidebar.all_inboxes')}</span>
            </div>
            {isUnifiedInbox && (
              <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                {messages.length}
              </span>
            )}
          </button>

          {/* Account Rows */}
          {accounts.map((acc) => {
            const isSelected =
              currentView === 'mail' &&
              specialView === 'none' &&
              selectedLabelId === null &&
              !isUnifiedInbox &&
              selectedAccountId === acc.id
            const isOk = acc.status === 'active'
            return (
              <button
                key={acc.id}
                type="button"
                onClick={async () => {
                  onNavigateView?.('mail')
                  showView('none')
                  select(acc.id)
                  await loadFolders(acc.id, { forceInbox: true })
                }}
                className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                  isSelected
                    ? 'bg-surface-container-highest dark:bg-surface-elevated text-on-surface dark:text-white font-semibold shadow-sm'
                    : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-space-sm min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: acc.color || (isOk ? '#10b981' : '#f59e0b') }}
                  />
                  <span className="truncate font-body-sm text-body-sm">
                    {acc.displayName || acc.email}
                  </span>
                </div>
                <span
                  className="material-symbols-outlined text-[15px]"
                  style={{ color: isOk ? '#10b981' : '#f59e0b' }}
                  title={isOk ? t('sidebar.account_connected') : t('sidebar.account_warning')}
                >
                  {isOk ? 'check_circle' : 'warning'}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Folders Section */}
      <div className="mb-space-lg">
        <div className="px-space-sm mb-space-xs">
          <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">
            {t('sidebar.folders')}
          </span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {/* Odebrane (Inbox) */}
          <button
            type="button"
            onClick={async () => {
              onNavigateView?.('mail')
              showView('none')
              if (selectedAccountId && inboxFolder) {
                await selectFolder(inboxFolder.id)
              } else if (selectedAccountId) {
                await loadFolders(selectedAccountId, { forceInbox: true })
              } else {
                select(null)
                await selectUnifiedInbox()
              }
            }}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'mail' &&
              specialView === 'none' &&
              selectedLabelId === null &&
              ((!isUnifiedInbox && inboxFolder && selectedFolderId === inboxFolder.id) ||
               (isUnifiedInbox && selectedFolderId === 'unified'))
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px]">inbox</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.folder.inbox')}</span>
            </div>
            {unreadInboxCount > 0 && (
              <span className="font-label-mono text-caption bg-primary-fixed text-on-primary-fixed-variant dark:bg-indigo-500/25 dark:border dark:border-indigo-400/30 dark:text-indigo-200 px-1.5 py-0.2 rounded-full font-semibold">
                {unreadInboxCount}
              </span>
            )}
          </button>

          {/* Zaplanowane (Scheduled) */}
          <button
            type="button"
            onClick={() => {
              onNavigateView?.('mail')
              showView('scheduled')
            }}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'mail' && specialView === 'scheduled'
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px]">schedule_send</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.folder.scheduled')}</span>
            </div>
            {getSpecialCount('scheduled') > 0 && (
              <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                {getSpecialCount('scheduled')}
              </span>
            )}
          </button>

          {/* Uśpione (Snoozed) */}
          <button
            type="button"
            onClick={() => {
              onNavigateView?.('mail')
              showView('snoozed')
            }}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'mail' && specialView === 'snoozed'
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px]">snooze</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.folder.snoozed')}</span>
            </div>
            {getSpecialCount('snoozed') > 0 && (
              <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                {getSpecialCount('snoozed')}
              </span>
            )}
          </button>

          {/* Do follow-upu */}
          <button
            type="button"
            onClick={() => {
              onNavigateView?.('mail')
              showView('followups')
            }}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'mail' && specialView === 'followups'
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">flag</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.folder.followups')}</span>
            </div>
            {getSpecialCount('followups') > 0 && (
              <span className="font-label-mono text-caption text-amber-700 bg-amber-100 dark:bg-amber-950/50 dark:border dark:border-amber-500/30 dark:text-amber-300 px-1.5 py-0.2 rounded-full font-medium">
                {getSpecialCount('followups')}
              </span>
            )}
          </button>

          {/* Wersje robocze (Drafts) */}
          {draftsFolder && (
            <button
              type="button"
              onClick={() => {
                onNavigateView?.('mail')
                showView('none')
                selectFolder(draftsFolder.id)
              }}
              className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                currentView === 'mail' && specialView === 'none' && selectedFolderId === draftsFolder.id
                  ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[18px]">draft</span>
                <span className="font-body-sm text-body-sm">{t('sidebar.folder.drafts')}</span>
              </div>
              {draftsFolder.unreadCount > 0 && (
                <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                  {draftsFolder.unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Wysłane (Sent) */}
          {sentFolder && (
            <button
              type="button"
              onClick={() => {
                onNavigateView?.('mail')
                showView('none')
                selectFolder(sentFolder.id)
              }}
              className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                currentView === 'mail' && specialView === 'none' && selectedFolderId === sentFolder.id
                  ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span className="font-body-sm text-body-sm">{t('sidebar.folder.sent')}</span>
              </div>
            </button>
          )}

          {/* Archiwum (Archive) */}
          {archiveFolder && (
            <button
              type="button"
              onClick={() => {
                onNavigateView?.('mail')
                showView('none')
                selectFolder(archiveFolder.id)
              }}
              className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                currentView === 'mail' && specialView === 'none' && selectedFolderId === archiveFolder.id
                  ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[18px]">archive</span>
                <span className="font-body-sm text-body-sm">{t('sidebar.folder.archive')}</span>
              </div>
            </button>
          )}

          {/* Spam */}
          {spamFolder && (
            <button
              type="button"
              onClick={() => {
                onNavigateView?.('mail')
                showView('none')
                selectFolder(spamFolder.id)
              }}
              className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                currentView === 'mail' && specialView === 'none' && selectedFolderId === spamFolder.id
                  ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[18px]">report</span>
                <span className="font-body-sm text-body-sm">{t('sidebar.folder.spam')}</span>
              </div>
            </button>
          )}

          {/* Kosz (Trash) */}
          {trashFolder && (
            <button
              type="button"
              onClick={() => {
                onNavigateView?.('mail')
                showView('none')
                selectFolder(trashFolder.id)
              }}
              className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                currentView === 'mail' && specialView === 'none' && selectedFolderId === trashFolder.id
                  ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[18px]">delete</span>
                <span className="font-body-sm text-body-sm">{t('sidebar.folder.trash')}</span>
              </div>
            </button>
          )}

          {/* Custom Folders */}
          {customFolders.map((cf) => (
            <button
              key={cf.id}
              type="button"
              onClick={() => {
                onNavigateView?.('mail')
                showView('none')
                selectFolder(cf.id)
              }}
              className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                currentView === 'mail' && specialView === 'none' && selectedFolderId === cf.id
                  ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-space-sm min-w-0">
                <span className="material-symbols-outlined text-[18px]">folder</span>
                <span className="font-body-sm text-body-sm truncate">{cf.displayName}</span>
              </div>
              {cf.unreadCount > 0 && (
                <span className="font-label-mono text-caption bg-primary-fixed text-on-primary-fixed-variant dark:bg-indigo-500/25 dark:border dark:border-indigo-400/30 dark:text-indigo-200 px-1.5 py-0.2 rounded-full font-semibold">
                  {cf.unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Workspace Modules (Kalendarz & Załączniki) */}
      <div className="mb-space-lg">
        <div className="px-space-sm mb-space-xs">
          <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">
            {t('sidebar.tools')}
          </span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {/* Kalendarz */}
          <button
            type="button"
            onClick={() => onNavigateView?.('calendar')}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'calendar'
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.tool.calendar')}</span>
            </div>
            <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
              W26
            </span>
          </button>

          {/* Załączniki i pliki */}
          <button
            type="button"
            onClick={() => onNavigateView?.('files')}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'files'
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px]">attachment</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.tool.files')}</span>
            </div>
            <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
              Drive
            </span>
          </button>

          {/* Ustawienia */}
          <button
            type="button"
            onClick={() => onNavigateView?.('settings')}
            className={`w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
              currentView === 'settings'
                ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[18px]">settings</span>
              <span className="font-body-sm text-body-sm">{t('sidebar.tool.settings')}</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Labels Section */}
      <div className="mt-auto pt-space-md border-t border-border-subtle dark:border-white/[0.08]">
        <div className="px-space-sm mb-space-xs flex items-center justify-between">
          <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">
            {t('sidebar.labels')}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditingLabel(null)
              setLabelDialogOpen(true)
            }}
            className="text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white p-0.5 rounded transition-colors"
            title={t('sidebar.add_label')}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {labels.map((lbl) => {
            const isSelected = currentView === 'mail' && specialView === 'none' && selectedLabelId === lbl.id
            return (
              <div
                key={lbl.id}
                className={`group w-full flex items-center justify-between px-space-sm py-1.5 rounded-xl transition-all text-left ${
                  isSelected
                    ? 'bg-surface-container-highest dark:bg-indigo-950/60 text-on-surface dark:text-white font-semibold shadow-sm dark:border dark:border-indigo-500/30'
                    : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-elevated hover:text-on-surface dark:hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onNavigateView?.('mail')
                    showView('none')
                    selectLabel(lbl.id)
                  }}
                  className="flex-1 flex items-center gap-space-sm min-w-0 text-left cursor-pointer"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lbl.color, boxShadow: `0 0 5px ${lbl.color}80` }}
                  />
                  <span className="font-body-sm text-body-sm truncate">{getLocalizedLabelName(lbl, t)}</span>
                </button>

                <div className="flex items-center gap-1">
                  {lbl.messageCount > 0 && (
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted group-hover:hidden">
                      {lbl.messageCount}
                    </span>
                  )}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingLabel(lbl)
                        setLabelDialogOpen(true)
                      }}
                      className="p-0.5 hover:text-primary rounded text-on-surface-variant dark:text-text-muted transition-colors"
                      title={t('common.edit')}
                    >
                      <span className="material-symbols-outlined text-[15px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(t('labels.dialog.delete_confirm', { name: lbl.name }))) {
                          deleteLabel(lbl.id)
                        }
                      }}
                      className="p-0.5 hover:text-rose-500 rounded text-on-surface-variant dark:text-text-muted transition-colors"
                      title={t('common.delete')}
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </nav>

        {/* Dynamic Connection status & Brand System info badge */}
        <div
          className="mt-4 pt-3 border-t border-border-subtle dark:border-white/[0.08] flex items-center justify-between px-space-sm text-on-surface-variant dark:text-text-muted text-caption cursor-pointer hover:bg-surface-container-highest/30 rounded-lg p-1 transition-colors"
          onClick={() => syncAllAccounts()}
          title={
            connectionState === 'connected'
              ? t('sidebar.status.connected')
              : connectionState === 'connecting'
              ? t('sidebar.status.connecting')
              : connectionState === 'error'
              ? t('sidebar.status.error')
              : t('sidebar.status.disconnected')
          }
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
            <span>Aura Mail Core</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                connectionState === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                  : connectionState === 'connecting'
                  ? 'bg-amber-400 animate-ping shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                  : connectionState === 'error'
                  ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
                  : 'bg-neutral-400'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Add Account Modal Dialog */}
      <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      {/* Label Create / Edit Modal Dialog */}
      <LabelDialog
        open={labelDialogOpen}
        onClose={() => setLabelDialogOpen(false)}
        editingLabel={editingLabel}
      />
    </aside>
  )
}
