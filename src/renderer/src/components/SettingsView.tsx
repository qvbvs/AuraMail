import React, { useEffect, useMemo, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation, getLocalizedLabelName, type Language } from '../i18n'
import { useTheme, type ThemeMode } from '../theme/ThemeContext'
import { LabelDialog } from './LabelDialog'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Button, Icon, IconButton } from './ui/Button'
import { Field, SwitchRow } from './ui/Field'
import { playNotificationSound } from '../utils/sound'
import type { AccountSecurity, AccountSummary, BandwidthPoint, FolderSummary, MailRule, MailRuleConditionField, TestConnectionStep, LabelSummary } from '@shared/ipc'

interface SettingsViewProps {
  onBackToMail: () => void
  onOpenAddAccount: () => void
}

type Section = 'general' | 'accounts' | 'labels'

const SECTIONS: { id: Section; key: string; icon: string }[] = [
  { id: 'general', key: 'settings.tab.general', icon: 'tune' },
  { id: 'accounts', key: 'settings.tab.accounts', icon: 'alternate_email' },
  { id: 'labels', key: 'sidebar.labels', icon: 'label' }
]

const folderName = (f: FolderSummary, t: (k: string) => string): string =>
  ['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'].includes(f.type) ? t(`sidebar.folder.${f.type}`) : f.displayName

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A titled block of settings; the page reads top to bottom like a document. */
function Block({ title, description, action, children }: { title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <section className="py-7 border-b border-line last:border-b-0">
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-md font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-2 leading-relaxed">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <p role={ok ? 'status' : 'alert'} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-ok' : 'text-danger'}`}>
      <Icon name={ok ? 'check_circle' : 'error'} className="!text-[15px]" />
      {children}
    </p>
  )
}

export function SettingsView({ onBackToMail, onOpenAddAccount }: SettingsViewProps): JSX.Element {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('general')
  const { accounts } = useAccountsStore()
  const labels = useLabelsStore((s) => s.labels)
  const counts: Partial<Record<Section, number>> = { accounts: accounts.length, labels: labels.length }

  return (
    <div className="flex-1 min-w-0 flex max-md:flex-col">
      <nav className="w-56 max-md:w-full flex-shrink-0 border-r max-md:border-r-0 max-md:border-b border-line px-3 py-4 flex md:flex-col gap-px max-md:overflow-x-auto" aria-label={t('settings.title')}>
        <button type="button" onClick={onBackToMail} className="hidden md:flex items-center gap-1.5 h-7 px-2 mb-3 rounded text-xs text-ink-3 hover:text-ink hover:bg-hover">
          <Icon name="arrow_back" className="!text-[16px]" />
          {t('settings.back_to_mail_short')}
        </button>
        <h1 className="hidden md:block font-bold tracking-[-0.02em] text-2xl text-ink px-2 mb-4">{t('settings.title')}</h1>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id ? 'page' : undefined}
            onClick={() => setSection(s.id)}
            className={`h-8 flex items-center gap-2.5 px-2.5 rounded text-sm whitespace-nowrap ${section === s.id ? 'bg-raised shadow-1 text-ink font-medium' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}
          >
            <Icon name={s.icon} className={section === s.id ? 'text-accent' : 'text-ink-3'} />
            <span className="flex-1 text-left">{t(s.key)}</span>
            {counts[s.id] !== undefined && <span className="text-xs text-ink-3 tabular-nums">{counts[s.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[720px] px-8 max-sm:px-4 pb-16">
          {section === 'general' && <GeneralSection />}
          {section === 'accounts' && <AccountsSection onOpenAddAccount={onOpenAddAccount} />}
          {section === 'labels' && <LabelsSection />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ General */

function GeneralSection(): JSX.Element {
  const { language, setLanguage, t } = useTranslation()
  const { theme, setTheme } = useTheme()
  // Boolean settings read by the main process on every sync/notification ('false' = off, default on).
  const FLAGS = ['notifyNewMail', 'notifyDesktop', 'notifySound', 'notifyPreview', 'autoSyncEnabled'] as const
  const [flags, setFlags] = useState<Record<(typeof FLAGS)[number], boolean>>({ notifyNewMail: true, notifyDesktop: true, notifySound: true, notifyPreview: true, autoSyncEnabled: true })
  const [flagsLoaded, setFlagsLoaded] = useState(false)
  const setFlag = (key: (typeof FLAGS)[number], value: boolean): void => {
    setFlags((f) => ({ ...f, [key]: value }))
    window.mailapp.settings.set(key, value ? 'true' : 'false')
  }
  const [prefs, setPrefs] = useState({ openAtLogin: false, startMinimized: false })
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  useEffect(() => {
    Promise.all(FLAGS.map((k) => window.mailapp.settings.get(k))).then((values) => {
      setFlags(Object.fromEntries(FLAGS.map((k, i) => [k, values[i] !== 'false'])) as typeof flags)
      setFlagsLoaded(true)
    })
    window.mailapp.system.getLoginItemPrefs().then((p) => {
      setPrefs(p)
      setPrefsLoaded(true)
    })
  }, [])

  const updatePrefs = async (patch: Partial<typeof prefs>): Promise<void> => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    await window.mailapp.system.setLoginItemPrefs(next)
  }

  const themes: [ThemeMode, string, string][] = [
    ['light', 'light_mode', t('onboarding.appearance.theme.light')],
    ['dark', 'dark_mode', t('onboarding.appearance.theme.dark')],
    ['system', 'computer', t('onboarding.appearance.theme.system')]
  ]
  const languages: [Language, string, string][] = [
    ['pl', 'Polski', t('settings.default_app_language')],
    ['en', 'English', t('settings.english_ui_desc')]
  ]

  return (
    <>
      <Block title={t('onboarding.appearance.theme')} description={t('onboarding.appearance.subtitle')}>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('onboarding.appearance.theme')}>
          {themes.map(([mode, icon, label]) => (
            <label key={mode} className="cursor-pointer">
              <input type="radio" name="theme" className="peer sr-only" checked={theme === mode} onChange={() => setTheme(mode)} />
              <span className="flex items-center gap-2 h-10 px-3 rounded border border-line-strong bg-raised text-sm text-ink-2 peer-checked:border-accent peer-checked:text-ink peer-checked:shadow-[0_0_0_1px_var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <Icon name={icon} />
                {label}
              </span>
            </label>
          ))}
        </div>
      </Block>

      <Block title={t('settings.language.title')} description={t('settings.language.desc')}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.language.title')}>
          {languages.map(([code, name, desc]) => (
            <label key={code} className="cursor-pointer">
              <input type="radio" name="language" className="peer sr-only" checked={language === code} onChange={() => setLanguage(code)} />
              <span className="block px-3 py-2.5 rounded border border-line-strong bg-raised peer-checked:border-accent peer-checked:shadow-[0_0_0_1px_var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                <span className="block text-sm font-medium text-ink">{name}</span>
                <span className="block text-xs text-ink-3">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </Block>

      <Block title={t('settings.desktop_notifications_title')} description={t('settings.notifications_always_desc')}>
        <div className="divide-y divide-line">
          <SwitchRow checked={flags.notifyNewMail} disabled={!flagsLoaded} onChange={(v) => setFlag('notifyNewMail', v)} label={t('settings.new_mail_label')} description={t('settings.new_mail_toggle_desc')} />
          <SwitchRow checked={flags.notifyDesktop} disabled={!flagsLoaded || !flags.notifyNewMail} onChange={(v) => setFlag('notifyDesktop', v)} label={t('onboarding.notifications.desktop_title')} description={t('onboarding.notifications.desktop_desc')} />
          <SwitchRow checked={flags.notifyPreview} disabled={!flagsLoaded || !flags.notifyNewMail} onChange={(v) => setFlag('notifyPreview', v)} label={t('onboarding.notifications.preview_title')} description={t('onboarding.notifications.preview_desc')} />
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <SwitchRow checked={flags.notifySound} disabled={!flagsLoaded || !flags.notifyNewMail} onChange={(v) => setFlag('notifySound', v)} label={t('onboarding.notifications.sound_title')} description={t('onboarding.notifications.sound_desc')} />
            </div>
            <Button size="xs" variant="ghost" icon="volume_up" onClick={() => playNotificationSound()}>
              {t('onboarding.notifications.test_button')}
            </Button>
          </div>
        </div>
      </Block>

      <Block title={t('onboarding.sync.title')}>
        <SwitchRow checked={flags.autoSyncEnabled} disabled={!flagsLoaded} onChange={(v) => setFlag('autoSyncEnabled', v)} label={t('onboarding.sync.autosync_title')} description={t('onboarding.sync.autosync_desc')} />
      </Block>

      <Block title={t('settings.startup.title')} description={t('settings.startup.desc')}>
        <div className="divide-y divide-line">
          <SwitchRow checked={prefs.openAtLogin} disabled={!prefsLoaded} onChange={(v) => updatePrefs({ openAtLogin: v })} label={t('settings.startup.launch_at_login_label')} description={t('settings.startup.launch_at_login_desc')} />
          <SwitchRow
            checked={prefs.startMinimized}
            disabled={!prefsLoaded || !prefs.openAtLogin}
            onChange={(v) => updatePrefs({ startMinimized: v })}
            label={t('settings.startup.start_minimized_label')}
            description={t('settings.startup.start_minimized_desc')}
          />
        </div>
      </Block>
    </>
  )
}

/* ----------------------------------------------------------------- Accounts */

function AccountsSection({ onOpenAddAccount }: { onOpenAddAccount: () => void }): JSX.Element {
  const { t, formatDate } = useTranslation()
  const { accounts, selectedAccountId, remove, setDefault } = useAccountsStore()
  const { syncing, syncNow, lastSyncedAt } = useMailStore()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<AccountSummary | null>(null)

  const detail = accounts.find((a) => a.id === (detailId ?? selectedAccountId)) ?? accounts[0]

  if (accounts.length === 0) {
    return (
      <Block title={t('settings.tab.accounts')} description={t('settings.no_accounts_yet')}>
        <Button variant="primary" icon="add" onClick={onOpenAddAccount}>
          {t('addAccount.save_account')}
        </Button>
      </Block>
    )
  }

  return (
    <>
      <Block
        title={t('settings.tab.accounts')}
        description={lastSyncedAt ? `${t('settings.last_sync_label')} ${formatDate(lastSyncedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : t('settings.accounts.never_synced')}
        action={
          <Button size="sm" icon="add" onClick={onOpenAddAccount}>
            {t('addAccount.save_account')}
          </Button>
        }
      >
        <ul className="border border-line rounded divide-y divide-line bg-raised" role="radiogroup" aria-label={t('settings.tab.accounts')}>
          {accounts.map((acc) => {
            const ok = acc.status === 'active'
            const selected = detail?.id === acc.id
            return (
              <li key={acc.id} className={`flex items-center gap-3 pl-3 pr-2 py-2.5 ${selected ? 'bg-selected' : ''}`}>
                <button type="button" role="radio" aria-checked={selected} onClick={() => setDetailId(acc.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: acc.color }} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink truncate">{acc.displayName || acc.email}</span>
                      {acc.isDefault && <span className="chip">{t('settingsModal.default_badge')}</span>}
                    </span>
                    <span className="block text-xs text-ink-3 truncate">
                      {acc.email}, <span className={ok ? 'text-ok' : 'text-warn'}>{ok ? t('settings.status_active') : t('settingsModal.status_warning')}</span>
                    </span>
                    {acc.lastError && <span className="block text-xs text-warn truncate">{acc.lastError}</span>}
                  </span>
                </button>
                <IconButton size="sm" icon="sync" label={t('settings.sync_now_btn')} loading={syncing} onClick={() => syncNow(acc.id)} />
              </li>
            )
          })}
        </ul>
      </Block>

      {detail && (
        <>
          <Block
            title={detail.displayName || detail.email}
            description={detail.email}
            action={
              <div className="flex gap-1">
                {!detail.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => setDefault(detail.id)}>
                    {t('settings.make_default')}
                  </Button>
                )}
                <Button size="sm" variant="danger-ghost" icon="delete" onClick={() => setToDelete(detail)}>
                  {t('settingsModal.delete_account')}
                </Button>
              </div>
            }
          >
            <ServerForm account={detail} />
          </Block>
          <PasswordForm account={detail} />
          <RulesBlock account={detail} />
          <BandwidthBlock account={detail} />
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          await remove(toDelete.id)
          setDetailId(null)
        }}
        title={toDelete ? t('settings.accounts.delete_confirm_title', { email: toDelete.email }) : t('settings.delete_account_confirm_title')}
        description={t('settings.accounts.delete_confirm_desc')}
        confirmLabel={t('settingsModal.delete_account')}
        danger
      />
    </>
  )
}

interface ServerFormState {
  imapHost: string
  imapPort: string
  imapSecurity: AccountSecurity
  smtpHost: string
  smtpPort: string
  smtpSecurity: AccountSecurity
}

const toForm = (a: AccountSummary): ServerFormState => ({
  imapHost: a.imapHost,
  imapPort: String(a.imapPort),
  imapSecurity: a.imapSecurity,
  smtpHost: a.smtpHost,
  smtpPort: String(a.smtpPort),
  smtpSecurity: a.smtpSecurity
})

function ServerForm({ account }: { account: AccountSummary }): JSX.Element {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => toForm(account))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [steps, setSteps] = useState<{ label: string; steps: TestConnectionStep[] }[] | null>(null)

  useEffect(() => {
    setForm(toForm(account))
    setMessage(null)
    setSteps(null)
  }, [account.id])

  const dirty = useMemo(() => JSON.stringify(toForm(account)) !== JSON.stringify(form), [account, form])
  const port = (v: string): boolean => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 65535
  const errors = {
    imapHost: form.imapHost.trim() ? null : t('settings.field_required'),
    imapPort: port(form.imapPort) ? null : t('settings.field_port_range'),
    smtpHost: form.smtpHost.trim() ? null : t('settings.field_required'),
    smtpPort: port(form.smtpPort) ? null : t('settings.field_port_range')
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const save = async (): Promise<void> => {
    if (hasErrors) return
    setSaving(true)
    setMessage(null)
    try {
      await window.mailapp.accounts.update(account.id, {
        imapHost: form.imapHost.trim(),
        imapPort: Number(form.imapPort),
        imapSecurity: form.imapSecurity,
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort),
        smtpSecurity: form.smtpSecurity
      })
      useAccountsStore.getState().load()
      setMessage({ ok: true, text: t('settings.saved_server_changes') })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // The stored password never leaves the main process, so the renderer can only check
  // reachability (DNS/TCP/TLS) of the entered hosts; the login step is skipped here.
  const test = async (): Promise<void> => {
    setTesting(true)
    setSteps(null)
    try {
      const run = (protocol: 'imap' | 'smtp'): Promise<TestConnectionStep[]> =>
        window.mailapp.accounts
          .testConnection({
            host: (protocol === 'imap' ? form.imapHost : form.smtpHost).trim(),
            port: Number(protocol === 'imap' ? form.imapPort : form.smtpPort),
            security: protocol === 'imap' ? form.imapSecurity : form.smtpSecurity,
            protocol,
            email: account.email,
            password: ''
          })
          .then((s) => s.filter((x) => x.step !== 'auth'))
      const [imap, smtp] = await Promise.all([run('imap'), run('smtp')])
      setSteps([
        { label: 'IMAP', steps: imap },
        { label: 'SMTP', steps: smtp }
      ])
    } catch (err) {
      setSteps([{ label: '', steps: [{ step: 'tcp', ok: false, message: (err as Error).message }] }])
    } finally {
      setTesting(false)
    }
  }

  const column = (kind: 'imap' | 'smtp'): JSX.Element => {
    const host = kind === 'imap' ? 'imapHost' : 'smtpHost'
    const p = kind === 'imap' ? 'imapPort' : 'smtpPort'
    const sec = kind === 'imap' ? 'imapSecurity' : 'smtpSecurity'
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="eyebrow mb-2">{kind === 'imap' ? t('settings.imap_incoming_label') : t('settings.smtp_outgoing_label')}</legend>
        <Field label={t('settings.host_label')} error={errors[host]}>
          {({ id, describedBy, invalid }) => <input id={id} className="input" spellCheck={false} value={form[host]} onChange={(e) => setForm((f) => ({ ...f, [host]: e.target.value }))} aria-describedby={describedBy} aria-invalid={invalid} />}
        </Field>
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <Field label={t('addAccount.port')} error={errors[p]}>
            {({ id, describedBy, invalid }) => <input id={id} inputMode="numeric" className="input" value={form[p]} onChange={(e) => setForm((f) => ({ ...f, [p]: e.target.value }))} aria-describedby={describedBy} aria-invalid={invalid} />}
          </Field>
          <Field label={t('settings.encryption_label')}>
            {({ id }) => (
              <select id={id} className="select" value={form[sec]} onChange={(e) => setForm((f) => ({ ...f, [sec]: e.target.value as AccountSecurity }))}>
                <option value="ssl">SSL / TLS</option>
                <option value="starttls">{t('settings.security_starttls')}</option>
                <option value="none">{t('settings.security_none')}</option>
              </select>
            )}
          </Field>
        </div>
      </fieldset>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {column('imap')}
        {column('smtp')}
      </div>
      {form.imapSecurity === 'none' || form.smtpSecurity === 'none' ? (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <Icon name="warning" className="!text-[15px]" />
          {t('settings.unencrypted_warning')}
        </p>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" icon="lan" loading={testing} onClick={test}>
          {t('settings.test_reachability')}
        </Button>
        <span className="flex-1" />
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setForm(toForm(account))}>
            {t('settings.discard_changes_btn')}
          </Button>
        )}
        <Button size="sm" variant="primary" loading={saving} disabled={!dirty || hasErrors} onClick={save}>
          {t('settings.save_changes_btn')}
        </Button>
      </div>
      {message && <Notice ok={message.ok}>{message.text}</Notice>}
      {steps && (
        <div className="rounded border border-line px-4 py-3 grid sm:grid-cols-2 gap-4" aria-live="polite">
          {steps.map((group) => (
            <div key={group.label}>
              {group.label && <p className="eyebrow mb-1">{group.label}</p>}
              <ul className="flex flex-col gap-1">
                {group.steps.map((s, i) => (
                  <li key={`${s.step}-${i}`} className="flex items-start gap-2 text-xs text-ink-2">
                    <Icon name={s.ok ? 'check_circle' : 'cancel'} className={`!text-[15px] ${s.ok ? 'text-ok' : 'text-danger'}`} />
                    <span>
                      <span className="text-ink font-medium uppercase">{s.step}</span> — {s.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="sm:col-span-2 text-2xs text-ink-3">{t('settings.test_reachability_note')}</p>
        </div>
      )}
    </div>
  )
}

function PasswordForm({ account }: { account: AccountSummary }): JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setPassword('')
    setConfirm('')
    setMessage(null)
  }, [account.id])

  const mismatch = confirm.length > 0 && password !== confirm
  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!password || mismatch) return
    setSaving(true)
    setMessage(null)
    try {
      await window.mailapp.accounts.updateCredential(account.id, password)
      setMessage({ ok: true, text: t('settings.password_updated_msg') })
      setPassword('')
      setConfirm('')
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Block title={t('settings.password_title')} description={t('settings.password_local_desc')}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('settings.new_password_label')}>
            {({ id }) => <input id={id} type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label={t('settings.confirm_new_password_label')} error={mismatch ? t('settings.passwords_not_match') : null}>
            {({ id, describedBy, invalid }) => (
              <input id={id} type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
            )}
          </Field>
        </div>
        <div className="flex items-center gap-3">
          {message && <Notice ok={message.ok}>{message.text}</Notice>}
          <span className="flex-1" />
          <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!password || password !== confirm}>
            {t('settings.update_password_btn')}
          </Button>
        </div>
      </form>
    </Block>
  )
}

function RulesBlock({ account }: { account: AccountSummary }): JSX.Element {
  const { t } = useTranslation()
  const [rules, setRules] = useState<MailRule[]>([])
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [field, setField] = useState<MailRuleConditionField>('from')
  const [contains, setContains] = useState('')
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<MailRule | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [r, f] = await Promise.all([window.mailapp.rules.list(account.id), window.mailapp.folders.list(account.id)])
      setRules(r)
      setFolders(f)
      setTarget((cur) => (cur && f.some((x) => x.id === cur) ? cur : (f.find((x) => x.type === 'archive') ?? f[0])?.id ?? ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    setFormOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  const create = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim() || !contains.trim() || !target) return
    setSaving(true)
    setError(null)
    try {
      await window.mailapp.rules.create({ accountId: account.id, name: name.trim(), conditionField: field, conditionContains: contains.trim(), actionMoveToFolderId: target })
      setName('')
      setContains('')
      setFormOpen(false)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const label = (id: string): string => {
    const f = folders.find((x) => x.id === id)
    return f ? folderName(f, t) : '—'
  }

  return (
    <Block
      title={t('settings.tab.filters')}
      description={t('settings.rules_desc')}
      action={
        !formOpen && (
          <Button size="sm" icon="add" onClick={() => setFormOpen(true)}>
            {t('settings.new_rule_btn')}
          </Button>
        )
      }
    >
      {formOpen && (
        <form onSubmit={create} className="mb-4 rounded border border-line bg-raised p-4 flex flex-col gap-3">
          <Field label={t('settings.rule_name_label')}>{({ id }) => <input id={id} autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <Field label={t('settings.filter_if_label')}>
              {({ id }) => (
                <select id={id} className="select" value={field} onChange={(e) => setField(e.target.value as MailRuleConditionField)}>
                  <option value="from">{t('settings.filter_from_contains')}</option>
                  <option value="subject">{t('settings.filter_subject_contains')}</option>
                </select>
              )}
            </Field>
            <Field label={t('settings.value_label')}>{({ id }) => <input id={id} className="input" value={contains} onChange={(e) => setContains(e.target.value)} />}</Field>
          </div>
          <Field label={t('settings.filter_move_to_folder')} error={error}>
            {({ id, describedBy }) => (
              <select id={id} className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-describedby={describedBy}>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderName(f, t)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setFormOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!name.trim() || !contains.trim() || !target}>
              {t('settings.create_rule_btn')}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-ink-3">{t('settings.loading_ellipsis')}</p>
      ) : rules.length === 0 ? (
        !formOpen && <p className="text-sm text-ink-3">{t('settings.no_rules_for_account')}</p>
      ) : (
        <ul className="border border-line rounded divide-y divide-line bg-raised">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 pl-3 pr-2 py-2">
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium truncate ${rule.isActive ? 'text-ink' : 'text-ink-3'}`}>{rule.name}</span>
                <span className="block text-xs text-ink-3 truncate">
                  {t(rule.conditionField === 'from' ? 'settings.sender_short' : 'settings.subject_short')} {t('settings.contains_word')} „{rule.conditionContains}” → {label(rule.actionMoveToFolderId)}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={rule.isActive}
                aria-label={rule.name}
                onChange={async () => {
                  setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)))
                  await window.mailapp.rules.setActive(rule.id, !rule.isActive)
                }}
              />
              <IconButton size="sm" icon="delete" label={t('common.delete')} onClick={() => setToDelete(rule)} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          await window.mailapp.rules.delete(toDelete.id)
          setRules((prev) => prev.filter((r) => r.id !== toDelete.id))
        }}
        title={t('settings.delete_rule_title')}
        description={toDelete ? t('settings.delete_rule_desc', { name: toDelete.name }) : undefined}
        confirmLabel={t('common.delete')}
        danger
      />
    </Block>
  )
}

function BandwidthBlock({ account }: { account: AccountSummary }): JSX.Element | null {
  const { t } = useTranslation()
  const [points, setPoints] = useState<BandwidthPoint[]>([])

  useEffect(() => {
    let cancelled = false
    window.mailapp.bandwidth.recent(account.id).then((p) => !cancelled && setPoints(p))
    return () => {
      cancelled = true
    }
  }, [account.id])

  const path = useMemo(() => {
    if (points.length < 2) return null
    const max = Math.max(...points.map((p) => p.kbps), 1)
    const step = 300 / (points.length - 1)
    return 'M' + points.map((p, i) => `${(i * step).toFixed(1)},${(38 - (p.kbps / max) * 34).toFixed(1)}`).join(' L')
  }, [points])

  const total = points.reduce((s, p) => s + p.bytesTransferred, 0)
  const last = points.length ? points[points.length - 1].kbps : null

  return (
    <Block title={t('settings.node_bandwidth_label')} description={t('settings.bandwidth_desc')}>
      {path ? (
        <figure className="flex items-end gap-6">
          <svg viewBox="0 0 300 40" className="flex-1 h-12 overflow-visible" role="img" aria-label={t('settings.node_bandwidth_label')}>
            <path d={path} fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <figcaption className="text-right flex-shrink-0">
            <span className="block font-bold tracking-[-0.02em] text-xl text-ink tabular-nums">{last !== null ? `${last.toFixed(0)} KB/s` : '—'}</span>
            <span className="block text-xs text-ink-3">
              {t('settings.bandwidth_sent_label')} {formatBytes(total)}, {points.length} {t('settings.no_bandwidth_measurements')}
            </span>
          </figcaption>
        </figure>
      ) : (
        <p className="text-sm text-ink-3">{t('settings.no_measurements_yet')}</p>
      )}
    </Block>
  )
}

/* ------------------------------------------------------------------- Labels */

function LabelsSection(): JSX.Element {
  const { labels, loadLabels, deleteLabel } = useLabelsStore()
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LabelSummary | null>(null)
  const [toDelete, setToDelete] = useState<LabelSummary | null>(null)

  useEffect(() => {
    loadLabels()
  }, [loadLabels])

  return (
    <Block
      title={t('settings.labels.title')}
      description={t('settings.labels.desc')}
      action={
        <Button
          size="sm"
          icon="add"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          {t('sidebar.add_label')}
        </Button>
      }
    >
      {labels.length === 0 ? (
        <p className="text-sm text-ink-3">{t('settings.no_labels_yet')}</p>
      ) : (
        <ul className="border border-line rounded divide-y divide-line bg-raised">
          {labels.map((lbl) => (
            <li key={lbl.id} className="flex items-center gap-3 pl-3 pr-2 py-2">
              <span className="chip-dot !w-2.5 !h-2.5" style={{ backgroundColor: lbl.color }} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-ink truncate">{getLocalizedLabelName(lbl, t)}</span>
                <span className="block text-xs text-ink-3">{t('settings.label_message_count', { count: lbl.messageCount })}</span>
              </span>
              <IconButton
                size="sm"
                icon="edit"
                label={t('common.edit')}
                onClick={() => {
                  setEditing(lbl)
                  setDialogOpen(true)
                }}
              />
              <IconButton size="sm" icon="delete" label={t('common.delete')} onClick={() => setToDelete(lbl)} />
            </li>
          ))}
        </ul>
      )}

      <LabelDialog open={dialogOpen} onClose={() => setDialogOpen(false)} initialLabel={editing} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteLabel(toDelete.id)
        }}
        title={t('settings.delete_label_confirm_title')}
        description={toDelete ? t('settings.delete_label_confirm_desc', { name: toDelete.name }) : undefined}
        confirmLabel={t('common.delete')}
        danger
      />
    </Block>
  )
}
