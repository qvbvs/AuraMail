import React, { useEffect, useMemo, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation, getLocalizedLabelName } from '../i18n'
import { useTheme, type ThemeMode } from '../theme/ThemeContext'
import { LabelDialog } from './LabelDialog'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Button } from './ui/Button'
import type {
  AccountSecurity,
  AccountSummary,
  BandwidthPoint,
  FolderSummary,
  MailRule,
  MailRuleConditionField,
  TestConnectionStep,
  LabelSummary
} from '@shared/ipc'

interface SettingsViewProps {
  onBackToMail: () => void
  onOpenAddAccount: () => void
}

type SettingsTab = 'general' | 'accounts' | 'labels' | 'imap_smtp' | 'filters' | 'security' | 'notifications'

const FOLDER_TYPE_KEYS: Record<string, string> = {
  inbox: 'sidebar.folder.inbox',
  sent: 'sidebar.folder.sent',
  drafts: 'sidebar.folder.drafts',
  archive: 'sidebar.folder.archive',
  spam: 'sidebar.folder.spam',
  trash: 'sidebar.folder.trash'
}

function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelativeSync(iso: string | null, t: (key: string, vars?: Record<string, string | number>) => string, locale: string): string {
  if (!iso) return t('settings.accounts.never_synced')
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return t('settings.accounts.just_now')
  if (minutes < 60) return t('settings.accounts.min_ago', { min: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('settings.accounts.hours_ago', { hours })
  return new Date(iso).toLocaleString(locale)
}

const TABS: { id: SettingsTab; labelKey: string; defaultLabel: string; icon: string }[] = [
  { id: 'general', labelKey: 'settings.tab.general', defaultLabel: 'Ogólne i język', icon: 'settings' },
  { id: 'accounts', labelKey: 'settings.tab.accounts', defaultLabel: 'Konta pocztowe', icon: 'manage_accounts' },
  { id: 'labels', labelKey: 'sidebar.labels', defaultLabel: 'Etykiety', icon: 'label' },
  { id: 'imap_smtp', labelKey: 'settings.tab.imap_smtp', defaultLabel: 'Serwery IMAP / SMTP', icon: 'dns' },
  { id: 'filters', labelKey: 'settings.tab.filters', defaultLabel: 'Filtry i reguły', icon: 'alt_route' },
  { id: 'security', labelKey: 'settings.tab.security', defaultLabel: 'Bezpieczeństwo', icon: 'lock' },
  { id: 'notifications', labelKey: 'settings.tab.notifications', defaultLabel: 'Powiadomienia', icon: 'notifications_active' }
]

export function SettingsView({ onBackToMail, onOpenAddAccount }: SettingsViewProps): JSX.Element {
  const { accounts, select, selectedAccountId, remove, setDefault } = useAccountsStore()
  const { syncing, syncNow, lastSyncedAt } = useMailStore()
  const labels = useLabelsStore((s) => s.labels)
  const { t, locale } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [testSteps, setTestSteps] = useState<TestConnectionStep[] | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmAccount, setDeleteConfirmAccount] = useState<AccountSummary | null>(null)

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0]

  const handleTestConnection = async (accId: string): Promise<void> => {
    setTestingId(accId)
    setTestSteps(null)
    try {
      const acc = accounts.find((a) => a.id === accId)
      if (!acc) return
      const [imapSteps, smtpSteps] = await Promise.all([
        window.mailapp.accounts.testConnection({
          host: acc.imapHost,
          port: acc.imapPort,
          security: acc.imapSecurity,
          protocol: 'imap',
          email: acc.email,
          password: '***'
        }),
        window.mailapp.accounts.testConnection({
          host: acc.smtpHost,
          port: acc.smtpPort,
          security: acc.smtpSecurity,
          protocol: 'smtp',
          email: acc.email,
          password: '***'
        })
      ])
      setTestSteps([...imapSteps, ...smtpSteps])
    } catch (e) {
      setTestSteps([{ step: 'auth', ok: false, message: (e as Error).message }])
    } finally {
      setTestingId(null)
    }
  }

  const handleForceSync = (): void => {
    if (syncing) return
    if (selectedAccountId) syncNow(selectedAccountId)
    else if (accounts.length > 0) syncNow(accounts[0].id)
  }

  const handleDeleteAccount = async (): Promise<void> => {
    if (!deleteConfirmAccount) return
    setDeletingId(deleteConfirmAccount.id)
    try {
      await remove(deleteConfirmAccount.id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background dark:bg-[#0b0f19] text-on-surface dark:text-slate-100 select-none">
      <div className="px-space-xl py-space-lg max-w-[1200px] w-full mx-auto space-y-space-xl">
        {/* Top Settings Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-space-xs text-on-surface-variant dark:text-text-muted font-caption text-caption">
              <button
                type="button"
                onClick={onBackToMail}
                className="hover:text-primary dark:hover:text-indigo-400 cursor-pointer transition-colors flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                <span>{t('settings.back_to_mail_short')}</span>
              </button>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-on-surface dark:text-white font-medium">{t('settings.title', undefined, 'Ustawienia')}</span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface dark:text-white tracking-tight">{t('settings.title', undefined, 'Ustawienia')}</h1>
            <div className="flex items-center gap-space-md pt-1 flex-wrap">
              <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary dark:text-indigo-400">sync</span>
                {t('settings.last_sync_label')}{' '}
                <strong className="font-semibold text-on-surface dark:text-white">{formatRelativeSync(lastSyncedAt, t, locale)}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm">
            <Button variant="secondary" size="sm" onClick={handleForceSync} loading={syncing} icon={<span className="material-symbols-outlined text-[18px]">sync_saved_locally</span>}>
              {syncing ? t('settings.syncing_label') : t('settings.force_sync_label')}
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenAddAccount} icon={<span className="material-symbols-outlined text-[18px]">add</span>}>
              {t('addAccount.save_account')}
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-surface-container-low dark:bg-[#161f30] p-1 rounded-xl flex items-center gap-1 overflow-x-auto border border-border-subtle dark:border-white/[0.06]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-space-xs px-space-md py-2 rounded-lg font-title-sm text-title-sm transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-surface-container-lowest dark:bg-[#121826] text-primary dark:text-indigo-400 font-semibold shadow-sm'
                  : 'text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              <span>{t(tab.labelKey, undefined, tab.defaultLabel)}</span>
              {tab.id === 'accounts' && (
                <span className="ml-1 font-label-mono text-caption bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 px-1.5 py-0.2 rounded-full font-bold">
                  {accounts.length}
                </span>
              )}
              {tab.id === 'labels' && (
                <span className="ml-1 font-label-mono text-caption bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 px-1.5 py-0.2 rounded-full font-bold">
                  {labels.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'general' && <GeneralTab />}

        {activeTab === 'labels' && <LabelsTab />}

        {activeTab === 'notifications' && <NotificationsTab />}

        {activeTab === 'accounts' && (
          accounts.length === 0 ? (
            <div className="p-space-xl text-center rounded-xl border border-dashed border-border-subtle dark:border-white/[0.1] text-on-surface-variant dark:text-text-muted">
              {t('settings.no_accounts_yet')}{' '}
              <button type="button" onClick={onOpenAddAccount} className="text-primary dark:text-indigo-400 font-semibold hover:underline">
                {t('settingsModal.add_first_account')}
              </button>
              .
            </div>
          ) : (
            <AccountsTab
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelect={select}
              onSetDefault={setDefault}
              onDelete={setDeleteConfirmAccount}
              deletingId={deletingId}
              onTest={handleTestConnection}
              testingId={testingId}
              onSync={syncNow}
            />
          )
        )}

        {activeTab === 'imap_smtp' && (
          activeAccount ? (
            <ImapSmtpTab
              account={activeAccount}
              onTest={() => handleTestConnection(activeAccount.id)}
              testing={testingId === activeAccount.id}
              testSteps={testSteps}
            />
          ) : (
            <div className="p-6 text-center text-slate-500">{t('settings.select_or_add_account')}</div>
          )
        )}

        {activeTab === 'filters' && (
          activeAccount ? (
            <FiltersTab account={activeAccount} />
          ) : (
            <div className="p-6 text-center text-slate-500">{t('settings.select_or_add_account')}</div>
          )
        )}

        {activeTab === 'security' && (
          activeAccount ? (
            <SecurityTab account={activeAccount} />
          ) : (
            <div className="p-6 text-center text-slate-500">{t('settings.select_or_add_account')}</div>
          )
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirmAccount !== null}
        onClose={() => setDeleteConfirmAccount(null)}
        onConfirm={handleDeleteAccount}
        title={deleteConfirmAccount ? t('settings.accounts.delete_confirm_title', { email: deleteConfirmAccount.email }) : t('settings.delete_account_confirm_title')}
        description={
          deleteConfirmAccount
            ? t('settings.accounts.delete_confirm_desc')
            : undefined
        }
        confirmLabel={t('settingsModal.delete_account')}
        danger
      />
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Konta pocztowe                                                     */
/* ---------------------------------------------------------------------- */

function AccountsTab({
  accounts,
  selectedAccountId,
  onSelect,
  onSetDefault,
  onDelete,
  deletingId,
  onTest,
  testingId,
  onSync
}: {
  accounts: AccountSummary[]
  selectedAccountId: string | null
  onSelect: (id: string) => void
  onSetDefault: (id: string) => void
  onDelete: (acc: AccountSummary) => void
  deletingId: string | null
  onTest: (id: string) => void
  testingId: string | null
  onSync: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="space-y-space-md">
      {accounts.map((acc, index) => {
        const isSelected = acc.id === selectedAccountId || (selectedAccountId === null && index === 0)
        const isOk = acc.status === 'active'

        return (
          <div
            key={acc.id}
            className={`bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm hover:shadow-md transition-all relative overflow-hidden border border-border-subtle dark:border-white/[0.06] ${
              isSelected ? 'ring-2 ring-primary/40' : ''
            }`}
          >
            <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${isOk ? 'bg-primary dark:bg-indigo-500' : 'bg-amber-500'}`} />
            <div className="flex flex-col gap-space-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-md min-w-0">
                  <div
                    className="relative w-12 h-12 rounded-xl flex items-center justify-center font-headline-md font-bold shadow-inner text-white flex-shrink-0"
                    style={{ backgroundColor: acc.color || '#4f46e5' }}
                  >
                    {(acc.displayName || acc.email).slice(0, 2).toUpperCase()}
                    <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white ${isOk ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                      <span className="material-symbols-outlined text-[12px] font-bold">{isOk ? 'check' : 'priority_high'}</span>
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-space-xs flex-wrap">
                      <h2 className="font-title-sm text-title-sm text-on-surface dark:text-white font-bold truncate">
                        {acc.displayName || acc.email}
                      </h2>
                      {acc.isDefault && (
                        <span className="font-caption text-caption bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 px-2 py-0.5 rounded font-semibold uppercase tracking-wider text-[10px]">
                          {t('settingsModal.default_badge')}
                        </span>
                      )}
                    </div>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted truncate block">{acc.email}</span>
                    {acc.lastError && (
                      <span className="font-caption text-[11px] text-amber-700 dark:text-amber-400">{acc.lastError}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-space-sm py-1 rounded-full font-label-mono text-caption font-medium ${
                      isOk ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                    {isOk ? t('settings.status_active') : t('settingsModal.status_warning')}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect(acc.id)}
                    className="p-1.5 rounded-lg hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted hover:text-on-surface transition-colors"
                    title={t('settings.switch_to_inbox_tooltip')}
                  >
                    <span className="material-symbols-outlined text-[18px]">{isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm bg-surface-container-low/60 dark:bg-[#161f30]/60 p-space-md rounded-lg border border-border-subtle dark:border-white/[0.04]">
                <div className="flex items-start gap-space-sm min-w-0">
                  <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[18px] mt-0.5 flex-shrink-0">downloading</span>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">{t('settings.imap_label')}</span>
                    <p className="font-label-mono text-caption text-on-surface dark:text-white font-medium truncate">
                      {acc.imapHost}:{acc.imapPort} ({acc.imapSecurity.toUpperCase()})
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-space-sm min-w-0">
                  <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5 flex-shrink-0">send</span>
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">{t('settings.smtp_label')}</span>
                    <p className="font-label-mono text-caption text-on-surface dark:text-white font-medium truncate">
                      {acc.smtpHost}:{acc.smtpPort} ({acc.smtpSecurity.toUpperCase()})
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-space-xs gap-space-sm">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={acc.isDefault} disabled={acc.isDefault} onChange={() => onSetDefault(acc.id)} className="sr-only peer" />
                  <div className="w-8 h-4 bg-surface-container dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                  <span className="ml-2 font-caption text-caption font-medium text-on-surface dark:text-slate-300">{t('settings.default_sender_label')}</span>
                </label>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onTest(acc.id)}
                    disabled={testingId === acc.id}
                    className="px-space-sm py-1 rounded-lg bg-surface-container-low dark:bg-slate-800 hover:bg-surface-container text-on-surface dark:text-slate-200 font-caption text-caption font-medium transition-colors flex items-center gap-1 border border-border-subtle dark:border-white/[0.04]"
                  >
                    <span className={`material-symbols-outlined text-[15px] ${testingId === acc.id ? 'animate-spin text-primary' : 'text-emerald-600'}`}>network_check</span>
                    <span>{testingId === acc.id ? t('settings.testing_ellipsis') : t('settingsModal.test_connection_btn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSync(acc.id)}
                    className="px-space-sm py-1 rounded-lg bg-surface-container-low dark:bg-slate-800 hover:bg-surface-container text-on-surface dark:text-slate-200 font-caption text-caption font-medium transition-colors flex items-center gap-1 border border-border-subtle dark:border-white/[0.04]"
                  >
                    <span className="material-symbols-outlined text-[15px] text-primary dark:text-indigo-400">sync</span>
                    <span>{t('settings.sync_now_btn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(acc)}
                    disabled={deletingId === acc.id}
                    className="px-space-sm py-1 rounded-lg bg-surface-container-low dark:bg-slate-800 hover:bg-error-container hover:text-on-error-container text-on-surface-variant dark:text-text-muted font-caption text-caption font-medium transition-colors flex items-center gap-1 border border-border-subtle dark:border-white/[0.04]"
                  >
                    <span className="material-symbols-outlined text-[15px]">{deletingId === acc.id ? 'delete_forever' : 'delete'}</span>
                    <span>{deletingId === acc.id ? t('settings.deleting_ellipsis') : t('settingsModal.delete_account')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Serwery IMAP / SMTP                                                */
/* ---------------------------------------------------------------------- */

interface ImapSmtpFormState {
  imapHost: string
  imapPort: string
  imapSecurity: AccountSecurity
  smtpHost: string
  smtpPort: string
  smtpSecurity: AccountSecurity
}

function toFormState(acc: AccountSummary): ImapSmtpFormState {
  return {
    imapHost: acc.imapHost,
    imapPort: String(acc.imapPort),
    imapSecurity: acc.imapSecurity,
    smtpHost: acc.smtpHost,
    smtpPort: String(acc.smtpPort),
    smtpSecurity: acc.smtpSecurity
  }
}

function ImapSmtpTab({
  account,
  onTest,
  testing,
  testSteps
}: {
  account: AccountSummary
  onTest: () => void
  testing: boolean
  testSteps: TestConnectionStep[] | null
}): JSX.Element {
  const { t } = useTranslation()
  const STEP_LABELS: Record<TestConnectionStep['step'], string> = {
    dns: 'DNS',
    tcp: 'TCP',
    tls: 'TLS',
    auth: t('settings.step_auth_label')
  }
  const [form, setForm] = useState<ImapSmtpFormState>(() => toFormState(account))
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [bandwidthPoints, setBandwidthPoints] = useState<BandwidthPoint[]>([])

  useEffect(() => {
    setForm(toFormState(account))
    setSaveMessage(null)
  }, [account.id])

  useEffect(() => {
    let cancelled = false
    window.mailapp.bandwidth.recent(account.id).then((points) => {
      if (!cancelled) setBandwidthPoints(points)
    })
    return () => {
      cancelled = true
    }
  }, [account.id])

  const isDirty = useMemo(() => {
    const original = toFormState(account)
    return JSON.stringify(original) !== JSON.stringify(form)
  }, [account, form])

  const imapPortNum = Number(form.imapPort)
  const smtpPortNum = Number(form.smtpPort)
  const errors = {
    imapHost: form.imapHost.trim() ? null : t('settings.field_required'),
    imapPort: Number.isInteger(imapPortNum) && imapPortNum >= 1 && imapPortNum <= 65535 ? null : t('settings.field_port_range'),
    smtpHost: form.smtpHost.trim() ? null : t('settings.field_required'),
    smtpPort: Number.isInteger(smtpPortNum) && smtpPortNum >= 1 && smtpPortNum <= 65535 ? null : t('settings.field_port_range')
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const sparkline = useMemo(() => {
    if (bandwidthPoints.length < 2) return null
    const maxKbps = Math.max(...bandwidthPoints.map((p) => p.kbps), 1)
    const stepX = 200 / (bandwidthPoints.length - 1)
    const coords = bandwidthPoints.map((p, i) => `${(i * stepX).toFixed(1)},${(38 - (p.kbps / maxKbps) * 34).toFixed(1)}`)
    return { line: `M${coords.join(' L')}`, fill: `M${coords.join(' L')} L200,40 L0,40 Z` }
  }, [bandwidthPoints])
  const currentKbps = bandwidthPoints.length > 0 ? bandwidthPoints[bandwidthPoints.length - 1].kbps : null
  const totalBandwidthBytes = bandwidthPoints.reduce((sum, p) => sum + p.bytesTransferred, 0)

  async function handleSave(): Promise<void> {
    if (hasErrors) return
    setSaving(true)
    setSaveMessage(null)
    try {
      await window.mailapp.accounts.update(account.id, {
        imapHost: form.imapHost.trim(),
        imapPort: imapPortNum,
        imapSecurity: form.imapSecurity,
        smtpHost: form.smtpHost.trim(),
        smtpPort: smtpPortNum,
        smtpSecurity: form.smtpSecurity
      })
      useAccountsStore.getState().load()
      setSaveMessage({ ok: true, text: t('settings.saved_server_changes') })
    } catch (err) {
      setSaveMessage({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard(): void {
    setForm(toFormState(account))
    setSaveMessage(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
      <div className="lg:col-span-8 space-y-space-lg">
        <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm space-y-space-md border border-border-subtle dark:border-white/[0.06]">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px]">tune</span>
            <h3 className="font-headline-md text-headline-md text-on-surface dark:text-white font-bold">{account.displayName || account.email}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">
            <div className="space-y-space-sm bg-surface-container-low/40 dark:bg-[#161f30]/40 p-space-md rounded-xl border border-border-subtle dark:border-white/[0.04]">
              <span className="font-title-sm text-caption uppercase tracking-wider text-primary dark:text-indigo-400 font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">inbox</span>
                {t('settings.imap_incoming_label')}
              </span>
              <FormField label="Host" value={form.imapHost} error={errors.imapHost} onChange={(v) => setForm((f) => ({ ...f, imapHost: v }))} />
              <div className="grid grid-cols-2 gap-space-sm">
                <FormField label="Port" value={form.imapPort} error={errors.imapPort} onChange={(v) => setForm((f) => ({ ...f, imapPort: v }))} />
                <SecurityField value={form.imapSecurity} onChange={(v) => setForm((f) => ({ ...f, imapSecurity: v }))} />
              </div>
            </div>

            <div className="space-y-space-sm bg-surface-container-low/40 dark:bg-[#161f30]/40 p-space-md rounded-xl border border-border-subtle dark:border-white/[0.04]">
              <span className="font-title-sm text-caption uppercase tracking-wider text-secondary font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">send</span>
                {t('settings.smtp_outgoing_label')}
              </span>
              <FormField label="Host" value={form.smtpHost} error={errors.smtpHost} onChange={(v) => setForm((f) => ({ ...f, smtpHost: v }))} />
              <div className="grid grid-cols-2 gap-space-sm">
                <FormField label="Port" value={form.smtpPort} error={errors.smtpPort} onChange={(v) => setForm((f) => ({ ...f, smtpPort: v }))} />
                <SecurityField value={form.smtpSecurity} onChange={(v) => setForm((f) => ({ ...f, smtpSecurity: v }))} />
              </div>
            </div>
          </div>

          {saveMessage && (
            <div
              className={`p-space-sm rounded-lg text-caption flex items-center gap-2 ${
                saveMessage.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-error-container dark:bg-rose-950/40 text-on-error-container dark:text-rose-300'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{saveMessage.ok ? 'check_circle' : 'error'}</span>
              {saveMessage.text}
            </div>
          )}

          <div className="flex items-center justify-between pt-space-xs flex-wrap gap-space-sm">
            <Button variant="secondary" size="sm" onClick={onTest} loading={testing} icon={<span className="material-symbols-outlined text-[16px]">speed</span>}>
              {t('addAccount.test_connection')}
            </Button>
            <div className="flex items-center gap-2">
              {isDirty && (
                <Button variant="ghost" size="sm" onClick={handleDiscard}>
                  {t('settings.discard_changes_btn')}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!isDirty || hasErrors}>
                {t('settings.save_changes_btn')}
              </Button>
            </div>
          </div>

          {testSteps && (
            <div className="p-space-sm rounded-xl bg-surface-container-low dark:bg-[#161f30] space-y-1 border border-border-subtle dark:border-white/[0.04]">
              {testSteps.map((s, i) => (
                <div
                  key={`${s.step}-${i}`}
                  className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-lg ${
                    s.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <span className="font-bold">{s.ok ? '✓' : '✗'}</span>
                  <strong>{STEP_LABELS[s.step]}:</strong>
                  <span className="truncate">{s.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-4 space-y-space-lg">
        <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm space-y-space-sm border border-border-subtle dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">{t('settings.node_bandwidth_label')}</span>
            <span className="font-label-mono text-caption text-primary dark:text-indigo-400 font-bold">{currentKbps !== null ? `${currentKbps.toFixed(1)} KB/s` : '—'}</span>
          </div>
          <div className="h-14 w-full flex items-end">
            {sparkline ? (
              <svg className="w-full h-12 overflow-visible" fill="none" viewBox="0 0 200 40">
                <defs>
                  <linearGradient id="syncGradientSettings" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={sparkline.fill} fill="url(#syncGradientSettings)" />
                <path d={sparkline.line} fill="none" stroke="#4f46e5" strokeLinecap="round" strokeWidth="2" />
              </svg>
            ) : (
              <p className="text-caption text-on-surface-variant dark:text-text-muted w-full text-center pb-2">{t('settings.no_measurements_yet')}</p>
            )}
          </div>
          <div className="flex items-center justify-between text-caption font-caption text-on-surface-variant dark:text-text-muted pt-1">
            <span>
              {t('settings.bandwidth_sent_label')} <strong className="text-on-surface dark:text-white">{formatBytesShort(totalBandwidthBytes)}</strong>
            </span>
            <span className="font-label-mono">{bandwidthPoints.length} {t('settings.no_bandwidth_measurements')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormField({
  label,
  value,
  error,
  onChange
}: {
  label: string
  value: string
  error?: string | null
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-surface-container-lowest dark:bg-[#121826] px-space-sm py-2 rounded-lg text-on-surface dark:text-white font-label-mono text-body-sm outline-none border ${
          error ? 'border-error dark:border-rose-500' : 'border-border-subtle dark:border-white/[0.06]'
        }`}
      />
      {error && <span className="text-[10px] text-error dark:text-rose-400">{error}</span>}
    </div>
  )
}

function SecurityField({ value, onChange }: { value: AccountSecurity; onChange: (v: AccountSecurity) => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('settings.encryption_label')}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AccountSecurity)}
        className="w-full bg-surface-container-lowest dark:bg-[#121826] px-space-sm py-2 rounded-lg text-on-surface dark:text-white font-caption text-body-sm outline-none border border-border-subtle dark:border-white/[0.06]"
      >
        <option value="ssl">SSL / TLS</option>
        <option value="starttls">{t('settings.security_starttls')}</option>
        <option value="none">{t('settings.security_none')}</option>
      </select>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Filtry i reguły                                                    */
/* ---------------------------------------------------------------------- */

function FiltersTab({ account }: { account: AccountSummary }): JSX.Element {
  const { t } = useTranslation()
  const [rules, setRules] = useState<MailRule[]>([])
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [conditionField, setConditionField] = useState<MailRuleConditionField>('from')
  const [conditionContains, setConditionContains] = useState('')
  const [targetFolderId, setTargetFolderId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [r, f] = await Promise.all([window.mailapp.rules.list(account.id), window.mailapp.folders.list(account.id)])
      setRules(r)
      setFolders(f)
      if (!targetFolderId && f.length > 0) setTargetFolderId(f[0].id)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    setFormOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  async function handleCreate(): Promise<void> {
    if (!name.trim() || !conditionContains.trim() || !targetFolderId) return
    setSaving(true)
    setError(null)
    try {
      await window.mailapp.rules.create({
        accountId: account.id,
        name: name.trim(),
        conditionField,
        conditionContains: conditionContains.trim(),
        actionMoveToFolderId: targetFolderId
      })
      setName('')
      setConditionContains('')
      setFormOpen(false)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(rule: MailRule): Promise<void> {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)))
    await window.mailapp.rules.setActive(rule.id, !rule.isActive)
  }

  async function handleDelete(rule: MailRule): Promise<void> {
    setRules((prev) => prev.filter((r) => r.id !== rule.id))
    await window.mailapp.rules.delete(rule.id)
  }

  function folderLabel(id: string): string {
    const f = folders.find((x) => x.id === id)
    if (!f) return t('settings.no_folder_placeholder')
    return FOLDER_TYPE_KEYS[f.type] ? t(FOLDER_TYPE_KEYS[f.type]) : f.displayName
  }

  return (
    <div className="max-w-2xl space-y-space-lg">
      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm space-y-space-md border border-border-subtle dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-secondary text-[20px]">filter_list</span>
            <h3 className="font-headline-md text-headline-md text-on-surface dark:text-white font-bold">{t('settings.rules_for_account', { email: account.email })}</h3>
          </div>
          {!formOpen && (
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)} icon={<span className="material-symbols-outlined text-[16px]">add</span>}>
              {t('settings.new_rule_btn')}
            </Button>
          )}
        </div>
        <p className="font-body-sm text-caption text-on-surface-variant dark:text-text-muted">
          {t('settings.rules_desc')}
        </p>

        {formOpen && (
          <div className="p-space-md rounded-xl bg-surface-container-low/60 dark:bg-[#161f30]/60 space-y-space-sm border border-border-subtle dark:border-white/[0.04]">
            <FormField label={t('settings.rule_name_label')} value={name} onChange={setName} />
            <div className="grid grid-cols-2 gap-space-sm">
              <div className="space-y-1">
                <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('settings.filter_if_label')}</label>
                <select
                  value={conditionField}
                  onChange={(e) => setConditionField(e.target.value as MailRuleConditionField)}
                  className="w-full bg-surface-container-lowest dark:bg-[#121826] px-space-sm py-2 rounded-lg text-on-surface dark:text-white text-body-sm outline-none border border-border-subtle dark:border-white/[0.06]"
                >
                  <option value="from">{t('settings.filter_from_contains')}</option>
                  <option value="subject">{t('settings.filter_subject_contains')}</option>
                </select>
              </div>
              <FormField label={t('settings.value_label')} value={conditionContains} onChange={setConditionContains} />
            </div>
            <div className="space-y-1">
              <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('settings.filter_move_to_folder')}</label>
              <select
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
                className="w-full bg-surface-container-lowest dark:bg-[#121826] px-space-sm py-2 rounded-lg text-on-surface dark:text-white text-body-sm outline-none border border-border-subtle dark:border-white/[0.06]"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {FOLDER_TYPE_KEYS[f.type] ? t(FOLDER_TYPE_KEYS[f.type]) : f.displayName}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-[11px] text-error dark:text-rose-400">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleCreate} loading={saving} disabled={!name.trim() || !conditionContains.trim() || !targetFolderId}>
                {t('settings.create_rule_btn')}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-space-sm">
          {loading ? (
            <p className="text-caption text-on-surface-variant dark:text-text-muted py-2">{t('settings.loading_ellipsis')}</p>
          ) : rules.length === 0 ? (
            <p className="text-caption text-on-surface-variant dark:text-text-muted py-2 text-center">{t('settings.no_rules_for_account')}</p>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="p-space-sm rounded-xl bg-surface-container-low/70 dark:bg-[#161f30]/60 space-y-1.5 border border-border-subtle dark:border-white/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.isActive ? 'bg-primary' : 'bg-outline-variant'}`} />
                    <span className="font-title-sm text-caption text-on-surface dark:text-white font-bold truncate">{rule.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={rule.isActive} onChange={() => handleToggle(rule)} className="sr-only peer" />
                      <div className="w-7 h-4 bg-surface-container dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                    </label>
                    <button type="button" onClick={() => handleDelete(rule)} className="p-1 rounded hover:bg-error-container dark:hover:bg-rose-950/40 text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
                <p className="font-caption text-[11px] text-on-surface-variant dark:text-text-muted">
                  {t(rule.conditionField === 'from' ? 'settings.sender_short' : 'settings.subject_short')} {t('settings.contains_word')} <code>{rule.conditionContains}</code> → {t('settings.move_to_word')}{' '}
                  <span className="bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 px-1 rounded font-semibold">
                    {folderLabel(rule.actionMoveToFolderId)}
                  </span>
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Bezpieczeństwo                                                     */
/* ---------------------------------------------------------------------- */

function SecurityTab({ account }: { account: AccountSummary }): JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const canSave = password.length > 0 && password === confirmPassword

  async function handleSave(): Promise<void> {
    if (!canSave) return
    setSaving(true)
    setMessage(null)
    try {
      await window.mailapp.accounts.updateCredential(account.id, password)
      setMessage({ ok: true, text: t('settings.password_updated_msg') })
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-space-lg">
      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm space-y-space-md border border-border-subtle dark:border-white/[0.06]">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px]">password</span>
          <h3 className="font-headline-md text-headline-md text-on-surface dark:text-white font-bold">{t('settings.account_password_title', { email: account.email })}</h3>
        </div>
        <p className="font-body-sm text-caption text-on-surface-variant dark:text-text-muted">
          {t('settings.password_local_desc')}
        </p>
        <FormField label={t('settings.new_password_label')} value={password} onChange={setPassword} />
        <FormField
          label={t('settings.confirm_new_password_label')}
          value={confirmPassword}
          error={confirmPassword && password !== confirmPassword ? t('settings.passwords_not_match') : null}
          onChange={setConfirmPassword}
        />
        {message && (
          <div className={`p-space-sm rounded-lg text-caption ${message.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-error-container text-on-error-container'}`}>
            {message.text}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!canSave}>
            {t('settings.update_password_btn')}
          </Button>
        </div>
      </div>

      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm space-y-space-sm border border-border-subtle dark:border-white/[0.06]">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px]">shield</span>
          <h3 className="font-headline-md text-headline-md text-on-surface dark:text-white font-bold">{t('settings.transport_encryption_title')}</h3>
        </div>
        <p className="font-body-sm text-caption text-on-surface-variant dark:text-text-muted">
          {t('settings.transport_desc_pre')}{' '}
          <span className="font-semibold text-on-surface dark:text-white">{t('settings.imap_smtp_tab_name')}</span>
          {t('settings.transport_desc_post', { imap: account.imapSecurity.toUpperCase(), smtp: account.smtpSecurity.toUpperCase() })}
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Powiadomienia                                                      */
/* ---------------------------------------------------------------------- */

function NotificationsTab(): JSX.Element {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.mailapp.settings.get('notifyNewMail').then((v) => {
      setEnabled(v !== 'false')
      setLoading(false)
    })
  }, [])

  async function handleToggle(checked: boolean): Promise<void> {
    setEnabled(checked)
    await window.mailapp.settings.set('notifyNewMail', checked ? 'true' : 'false')
  }

  return (
    <div className="max-w-xl">
      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-lg shadow-sm space-y-space-md border border-border-subtle dark:border-white/[0.06]">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px]">notifications_active</span>
          <h3 className="font-headline-md text-headline-md text-on-surface dark:text-white font-bold">{t('settings.desktop_notifications_title')}</h3>
        </div>

        <div className="flex items-start justify-between gap-space-sm">
          <div className="space-y-0.5">
            <span className="font-title-sm text-caption text-on-surface dark:text-white font-semibold">{t('settings.new_mail_label')}</span>
            <p className="font-caption text-[11px] text-on-surface-variant dark:text-text-muted">
              {t('settings.new_mail_toggle_desc')}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
            <input type="checkbox" checked={enabled} disabled={loading} onChange={(e) => handleToggle(e.target.checked)} className="sr-only peer" />
            <div className="w-8 h-4 bg-surface-container dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>

        <p className="font-caption text-[11px] text-on-surface-variant dark:text-text-muted pt-1 border-t border-border-subtle dark:border-white/[0.06]">
          {t('settings.notifications_always_desc')}
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Ogólne i język (General & Language)                                */
/* ---------------------------------------------------------------------- */

function GeneralTab(): JSX.Element {
  const { language, setLanguage, t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <div className="max-w-2xl space-y-6">
      {/* Język interfejsu */}
      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-6 shadow-sm space-y-4 border border-border-subtle dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <span className="material-symbols-outlined text-[20px]">translate</span>
          </div>
          <div>
            <h3 className="font-headline-md text-base text-on-surface dark:text-white font-bold">
              {t('settings.language.title', undefined, 'Język interfejsu (Application Language)')}
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-slate-400">
              {t('settings.language.desc', undefined, 'Wybierz preferowany język dla całego interfejsu AuraMail.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setLanguage('pl')}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3.5 transition-all ${
              language === 'pl'
                ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span className="text-3xl">🇵🇱</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold flex items-center justify-between">
                <span>{t('settings.language.polish', undefined, 'Polski (PL)')}</span>
                {language === 'pl' && (
                  <span className="material-symbols-outlined text-[18px] text-indigo-600 dark:text-indigo-400">check_circle</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('settings.default_app_language')}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3.5 transition-all ${
              language === 'en'
                ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span className="text-3xl">🇬🇧</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold flex items-center justify-between">
                <span>{t('settings.language.english', undefined, 'English (EN)')}</span>
                {language === 'en' && (
                  <span className="material-symbols-outlined text-[18px] text-indigo-600 dark:text-indigo-400">check_circle</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('settings.english_ui_desc')}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Motyw graficzny */}
      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-6 shadow-sm space-y-4 border border-border-subtle dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <span className="material-symbols-outlined text-[20px]">palette</span>
          </div>
          <div>
            <h3 className="font-headline-md text-base text-on-surface dark:text-white font-bold">
              {t('onboarding.appearance.theme', undefined, 'Motyw kolorystyczny')}
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-slate-400">
              {t('onboarding.appearance.subtitle', undefined, 'Wybierz tryb jasny, ciemny lub zsynchronizowany z systemem operacyjnym.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTheme(m)}
              className={`p-3.5 rounded-xl border text-center flex flex-col items-center gap-2 transition-all ${
                theme === m
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {m === 'light' ? 'light_mode' : m === 'dark' ? 'dark_mode' : 'brightness_auto'}
              </span>
              <span className="text-xs font-semibold">
                {m === 'light'
                  ? t('onboarding.appearance.theme.light', undefined, 'Jasny')
                  : m === 'dark'
                  ? t('onboarding.appearance.theme.dark', undefined, 'Ciemny')
                  : t('onboarding.appearance.theme.system', undefined, 'Systemowy')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Tab: Zarządzanie etykietami (Labels)                                    */
/* ---------------------------------------------------------------------- */

function LabelsTab(): JSX.Element {
  const { labels, loadLabels, deleteLabel } = useLabelsStore()
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState<LabelSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LabelSummary | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    loadLabels()
  }, [loadLabels])

  const handleCreate = (): void => {
    setEditingLabel(null)
    setDialogOpen(true)
  }

  const handleEdit = (lbl: LabelSummary): void => {
    setEditingLabel(lbl)
    setDialogOpen(true)
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteLabel(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-6 shadow-sm border border-border-subtle dark:border-white/[0.06] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <span className="material-symbols-outlined text-[20px]">label</span>
            </div>
            <div>
              <h3 className="font-headline-md text-base text-on-surface dark:text-white font-bold">
                {t('settings.labels.title', undefined, 'Zarządzanie etykietami')}
              </h3>
              <p className="text-xs text-on-surface-variant dark:text-slate-400">
                {t('settings.labels.desc', undefined, 'Twórz, edytuj kolory i organizuj swoje maile za pomocą etykiet.')}
              </p>
            </div>
          </div>

          <Button variant="primary" size="sm" onClick={handleCreate} icon={<span className="material-symbols-outlined text-[18px]">add</span>}>
            {t('sidebar.add_label', undefined, 'Dodaj etykietę')}
          </Button>
        </div>

        {/* Lista etykiet */}
        <div className="divide-y divide-slate-100 dark:divide-white/[0.04] border border-slate-200/80 dark:border-white/[0.06] rounded-xl overflow-hidden">
          {labels.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
              {t('settings.no_labels_yet')}
            </div>
          ) : (
            labels.map((lbl) => (
              <div
                key={lbl.id}
                className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0 shadow-2xs border border-white dark:border-slate-800"
                    style={{ backgroundColor: lbl.color }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {getLocalizedLabelName(lbl, t)}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                      {lbl.messageCount !== undefined ? t('settings.label_message_count', { count: lbl.messageCount }) : t('settings.label_word')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(lbl)}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                    title={t('common.edit', undefined, 'Edytuj')}
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(lbl)}
                    className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    title={t('common.delete', undefined, 'Usuń')}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <LabelDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialLabel={editingLabel || undefined}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={isDeleting}
        title={t('settings.delete_label_confirm_title')}
        description={
          deleteTarget
            ? t('settings.delete_label_confirm_desc', { name: deleteTarget.name })
            : undefined
        }
        confirmLabel={t('common.delete', undefined, 'Usuń')}
        danger
      />
    </div>
  )
}
