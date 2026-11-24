import React, { useEffect, useState } from 'react'
import { useTheme, type ThemeMode } from '../theme/ThemeContext'
import { useAccountsStore } from '../state/accounts-store'
import { playNotificationSound } from '../utils/sound'
import { useTranslation, type Language } from '../i18n'
import { WindowControls } from './WindowControls'
import { Brand } from './Brand'
import { Button, Icon } from './ui/Button'
import { Field, SwitchRow } from './ui/Field'
import { ACCOUNT_COLORS } from './AddAccountDialog'
import { isValidEmail } from './composer/RecipientField'
import type { AccountSecurity, CreateAccountInput, TestConnectionStep } from '@shared/ipc'

interface OnboardingWizardProps {
  onComplete: () => void
}

type ProviderPreset = 'gmail' | 'outlook' | 'onet' | 'wp' | 'interia' | 'custom'

interface ProviderConfig {
  nameKey: string
  imapHost: string
  imapPort: number
  imapSecurity: AccountSecurity
  smtpHost: string
  smtpPort: number
  smtpSecurity: AccountSecurity
  tipKey?: string
}

const PROVIDERS: Record<ProviderPreset, ProviderConfig> = {
  gmail: { nameKey: 'onboarding.provider.gmail_name', imapHost: 'imap.gmail.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecurity: 'ssl', tipKey: 'onboarding.provider.gmail_tip' },
  outlook: { nameKey: 'onboarding.provider.outlook_name', imapHost: 'outlook.office365.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecurity: 'starttls', tipKey: 'onboarding.provider.outlook_tip' },
  onet: { nameKey: 'onboarding.provider.onet_name', imapHost: 'imap.poczta.onet.pl', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.poczta.onet.pl', smtpPort: 465, smtpSecurity: 'ssl' },
  wp: { nameKey: 'onboarding.provider.wp_name', imapHost: 'imap.wp.pl', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.wp.pl', smtpPort: 465, smtpSecurity: 'ssl' },
  interia: { nameKey: 'onboarding.provider.interia_name', imapHost: 'poczta.interia.pl', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'poczta.interia.pl', smtpPort: 465, smtpSecurity: 'ssl' },
  custom: { nameKey: 'onboarding.provider.custom_name', imapHost: '', imapPort: 993, imapSecurity: 'ssl', smtpHost: '', smtpPort: 465, smtpSecurity: 'ssl' }
}

type DefaultView = 'mail' | 'calendar' | 'files'
type Step = 1 | 2 | 3

export function OnboardingWizard({ onComplete }: OnboardingWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>(1)
  const { theme, setTheme } = useTheme()
  const { language, setLanguage, t } = useTranslation()
  const { accounts, load: loadAccounts, create: createAccount } = useAccountsStore()

  const [provider, setProvider] = useState<ProviderPreset>('gmail')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [color, setColor] = useState(ACCOUNT_COLORS[0])
  const [server, setServer] = useState(() => ({ ...PROVIDERS.gmail }))
  const [showServers, setShowServers] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestConnectionStep[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  const [autoSync, setAutoSync] = useState(true)
  const [notifyNewMail, setNotifyNewMail] = useState(true)
  const [notifyDesktop, setNotifyDesktop] = useState(true)
  const [notifySound, setNotifySound] = useState(true)
  const [notifyPreview, setNotifyPreview] = useState(true)
  const [defaultView, setDefaultView] = useState<DefaultView>('mail')
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'unread_first'>('date_desc')

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const hasAccount = accounts.length > 0
  const emailInvalid = touched && email.trim() !== '' && !isValidEmail(email.trim())

  const chooseProvider = (p: ProviderPreset): void => {
    setProvider(p)
    setServer({ ...PROVIDERS[p] })
    setShowServers(p === 'custom')
    setTestResults(null)
    setAccountError(null)
  }

  const test = async (): Promise<void> => {
    setTouched(true)
    if (!isValidEmail(email.trim()) || !password || !server.imapHost.trim()) {
      setAccountError(t('onboarding.error.fill_credentials'))
      return
    }
    setTesting(true)
    setTestResults(null)
    setAccountError(null)
    try {
      const results = await window.mailapp.accounts.testConnection({ host: server.imapHost.trim(), port: server.imapPort, security: server.imapSecurity, protocol: 'imap', email: email.trim(), password })
      setTestResults(results)
      const failed = results.find((r) => !r.ok)
      if (failed) setAccountError(failed.message || t('onboarding.error.test_failed'))
    } catch (err) {
      setAccountError((err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const addAccount = async (): Promise<void> => {
    setTouched(true)
    if (!isValidEmail(email.trim()) || !password || !server.imapHost.trim() || !server.smtpHost.trim()) {
      setAccountError(t('onboarding.error.fill_credentials'))
      if (!server.imapHost.trim() || !server.smtpHost.trim()) setShowServers(true)
      return
    }
    setSubmitting(true)
    setAccountError(null)
    try {
      const input: CreateAccountInput = {
        email: email.trim(),
        displayName: displayName.trim() || email.trim().split('@')[0],
        imapHost: server.imapHost.trim(),
        imapPort: server.imapPort,
        imapSecurity: server.imapSecurity,
        smtpHost: server.smtpHost.trim(),
        smtpPort: server.smtpPort,
        smtpSecurity: server.smtpSecurity,
        authType: 'password',
        password,
        color
      }
      await createAccount(input)
      await loadAccounts()
      setPassword('')
      setStep(2)
    } catch (err) {
      setAccountError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const finish = async (): Promise<void> => {
    try {
      await Promise.all([
        window.mailapp.settings.set('autoSyncEnabled', String(autoSync)),
        window.mailapp.settings.set('notifyNewMail', String(notifyNewMail)),
        window.mailapp.settings.set('notifyDesktop', String(notifyDesktop)),
        window.mailapp.settings.set('notifySound', String(notifySound)),
        window.mailapp.settings.set('notifyPreview', String(notifyPreview)),
        window.mailapp.settings.set('defaultView', defaultView),
        window.mailapp.settings.set('sortOrder', sortOrder),
        window.mailapp.settings.set('app_language', language),
        window.mailapp.settings.set('onboardingCompleted', 'true')
      ])
    } catch {
      // Preferences are best-effort; the wizard must not trap the user.
    }
    onComplete()
  }

  const steps: { n: Step; key: string }[] = [
    { n: 1, key: 'onboarding.step.account' },
    { n: 2, key: 'onboarding.step.preferences' },
    { n: 3, key: 'onboarding.step.summary' }
  ]

  const serverField = (kind: 'imap' | 'smtp'): JSX.Element => {
    const host = kind === 'imap' ? 'imapHost' : 'smtpHost'
    const port = kind === 'imap' ? 'imapPort' : 'smtpPort'
    const sec = kind === 'imap' ? 'imapSecurity' : 'smtpSecurity'
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="eyebrow mb-2">{kind.toUpperCase()}</legend>
        <Field label={t(`onboarding.account.${kind}_host_label`)}>
          {({ id }) => <input id={id} className="input" spellCheck={false} value={server[host]} onChange={(e) => setServer((s) => ({ ...s, [host]: e.target.value }))} />}
        </Field>
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <Field label={t('addAccount.port')}>{({ id }) => <input id={id} type="number" className="input" value={server[port]} onChange={(e) => setServer((s) => ({ ...s, [port]: Number(e.target.value) || 0 }))} />}</Field>
          <Field label={t('addAccount.security')}>
            {({ id }) => (
              <select id={id} className="select" value={server[sec]} onChange={(e) => setServer((s) => ({ ...s, [sec]: e.target.value as AccountSecurity }))}>
                <option value="ssl">{t('addAccount.security_ssl')}</option>
                <option value="starttls">{t('addAccount.security_starttls')}</option>
                <option value="none">{t('addAccount.security_none')}</option>
              </select>
            )}
          </Field>
        </div>
      </fieldset>
    )
  }

  const radioCard = <T extends string>(name: string, value: T, current: T, onPick: (v: T) => void, label: React.ReactNode, icon?: string): JSX.Element => (
    <label key={value} className="cursor-pointer">
      <input type="radio" name={name} className="peer sr-only" checked={current === value} onChange={() => onPick(value)} />
      <span className="flex items-center gap-2 h-9 px-3 rounded border border-line-strong bg-raised text-sm text-ink-2 peer-checked:border-accent peer-checked:text-ink peer-checked:shadow-[0_0_0_1px_var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
        {icon && <Icon name={icon} />}
        {label}
      </span>
    </label>
  )

  return (
    <div className="w-screen h-screen flex flex-col bg-canvas">
      <div className="app-drag-region h-[var(--titlebar-h)] flex items-center justify-between pl-4 flex-shrink-0">
        <Brand />
        <div className="flex items-center h-full app-no-drag">
          <div className="segmented mr-3" role="group" aria-label={t('settings.language.title')}>
            {(['pl', 'en'] as Language[]).map((l) => (
              <button key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <WindowControls />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex max-md:flex-col">
        {/* Intro + progress */}
        <aside className="w-[340px] max-md:w-full flex-shrink-0 px-10 max-md:px-6 pt-10 max-md:pt-4 pb-6 flex flex-col">
          <h1 className="font-bold tracking-[-0.02em] text-[34px] leading-[1.1] text-ink max-md:text-2xl">{t('onboarding.welcome.title')}</h1>
          <p className="mt-3 text-sm text-ink-2 leading-relaxed max-md:hidden">{t('onboarding.welcome.desc')}</p>
          <ol className="mt-10 max-md:mt-4 flex md:flex-col gap-1 max-md:gap-4" aria-label={t('onboarding.title')}>
            {steps.map(({ n, key }) => {
              const done = n < step
              const current = n === step
              const reachable = n <= step || (hasAccount && n <= 3)
              return (
                <li key={n}>
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={current ? 'step' : undefined}
                    onClick={() => reachable && setStep(n)}
                    className={`flex items-center gap-3 h-8 text-sm disabled:cursor-not-allowed ${current ? 'text-ink font-medium' : done ? 'text-ink-2 hover:text-ink' : 'text-ink-3'}`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs tabular-nums ${current ? 'bg-ink text-canvas' : done ? 'bg-accent-soft text-accent-ink' : 'border border-line-strong'}`}>
                      {done ? <Icon name="check" className="!text-[14px]" /> : n}
                    </span>
                    {t(key)}
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* Step content on the paper sheet */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-panel border-l border-t border-line md:rounded-tl-lg max-md:border-l-0">
          <div className="max-w-[620px] px-10 max-sm:px-5 py-10">
            {step === 1 && (
              <form
                className="flex flex-col gap-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  addAccount()
                }}
              >
                <header>
                  <h2 className="font-bold tracking-[-0.02em] text-2xl text-ink">{t('onboarding.account.title')}</h2>
                  <p className="mt-1 text-sm text-ink-2">{t('onboarding.account.subtitle')}</p>
                </header>

                {hasAccount && (
                  <div className="flex items-center gap-3 rounded border border-line bg-raised px-4 py-3 text-sm">
                    <Icon name="check_circle" className="text-ok" />
                    <span className="flex-1 text-ink-2">{t('onboarding.account.connected_as', { email: accounts[0].email })}</span>
                    <Button size="sm" onClick={() => setStep(2)}>
                      {t('onboarding.account.continue_existing')}
                    </Button>
                  </div>
                )}

                <fieldset>
                  <legend className="field-label mb-2">{t('onboarding.account.provider_label')}</legend>
                  <div className="grid grid-cols-3 max-sm:grid-cols-2 gap-2">
                    {(Object.keys(PROVIDERS) as ProviderPreset[]).map((p) => radioCard('provider', p, provider, chooseProvider, t(PROVIDERS[p].nameKey)))}
                  </div>
                </fieldset>

                {PROVIDERS[provider].tipKey && (
                  <p className="flex gap-2 text-xs text-ink-2 leading-relaxed rounded bg-sunken/70 px-3 py-2.5">
                    <Icon name="key" className="!text-[16px] text-ink-3" />
                    {t(PROVIDERS[provider].tipKey!)}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={t('addAccount.email_label')} error={emailInvalid ? t('addAccount.email_invalid') : null}>
                    {({ id, describedBy, invalid }) => (
                      <input id={id} type="email" autoComplete="email" autoFocus className="input" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} placeholder={t('addAccount.email_placeholder')} aria-describedby={describedBy} aria-invalid={invalid} />
                    )}
                  </Field>
                  <Field label={t('onboarding.account.displayName_label')}>
                    {({ id }) => <input id={id} className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('onboarding.account.displayName_placeholder')} />}
                  </Field>
                </div>
                <Field label={t('onboarding.account.password_label')} error={touched && !password ? t('addAccount.required') : null}>
                  {({ id, describedBy, invalid }) => <input id={id} type="password" autoComplete="current-password" className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
                </Field>

                <fieldset>
                  <legend className="field-label mb-2">{t('onboarding.account.color_label')}</legend>
                  <div className="flex gap-1.5" role="radiogroup">
                    {ACCOUNT_COLORS.map((c) => (
                      <label key={c} className="cursor-pointer">
                        <input type="radio" name="color" className="peer sr-only" checked={color === c} onChange={() => setColor(c)} aria-label={c} />
                        <span className="block w-6 h-6 rounded border-2 border-transparent peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent" style={{ backgroundColor: c, boxShadow: 'inset 0 0 0 2px var(--panel)' }} />
                      </label>
                    ))}
                  </div>
                </fieldset>

                <section className="border-t border-line pt-4">
                  <button type="button" className="flex items-center gap-1.5 text-sm font-medium text-ink" aria-expanded={showServers} onClick={() => setShowServers((v) => !v)}>
                    <Icon name={showServers ? 'expand_more' : 'chevron_right'} className="text-ink-3" />
                    {t('addAccount.server_settings')}
                    {!showServers && server.imapHost && <span className="ml-2 text-xs font-normal text-ink-3">{server.imapHost}</span>}
                  </button>
                  {showServers && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {serverField('imap')}
                      {serverField('smtp')}
                    </div>
                  )}
                </section>

                {testResults && (
                  <ul className="flex flex-col gap-1 rounded border border-line px-4 py-3" aria-live="polite">
                    {testResults.map((r) => (
                      <li key={r.step} className="flex items-start gap-2 text-xs text-ink-2">
                        <Icon name={r.ok ? 'check_circle' : 'cancel'} className={`!text-[16px] ${r.ok ? 'text-ok' : 'text-danger'}`} />
                        <span>
                          <span className="text-ink font-medium uppercase">{r.step}</span> — {r.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {accountError && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
                    <Icon name="error" className="!text-[16px]" />
                    {accountError}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button variant="ghost" icon="lan" loading={testing} onClick={test}>
                    {t('addAccount.test_connection')}
                  </Button>
                  <span className="flex-1" />
                  <Button type="submit" variant="primary" size="lg" loading={submitting}>
                    {t('onboarding.account.save_continue')}
                  </Button>
                </div>
              </form>
            )}

            {step === 2 && (
              <div className="flex flex-col">
                <header className="mb-2">
                  <h2 className="font-bold tracking-[-0.02em] text-2xl text-ink">{t('onboarding.step.preferences')}</h2>
                  <p className="mt-1 text-sm text-ink-2">{t('onboarding.preferences.subtitle')}</p>
                </header>

                <section className="py-5 border-b border-line">
                  <h3 className="field-label mb-2">{t('onboarding.appearance.theme')}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['light', 'light_mode'],
                        ['dark', 'dark_mode'],
                        ['system', 'computer']
                      ] as [ThemeMode, string][]
                    ).map(([m, icon]) => radioCard('theme', m, theme, setTheme, t(`onboarding.appearance.theme.${m}`), icon))}
                  </div>
                </section>

                <section className="py-3 border-b border-line divide-y divide-line">
                  <SwitchRow checked={notifyNewMail} onChange={setNotifyNewMail} label={t('onboarding.notifications.newmail_title')} description={t('onboarding.notifications.newmail_desc')} />
                  <SwitchRow checked={notifyDesktop} disabled={!notifyNewMail} onChange={setNotifyDesktop} label={t('onboarding.notifications.desktop_title')} description={t('onboarding.notifications.desktop_desc')} />
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <SwitchRow checked={notifySound} disabled={!notifyNewMail} onChange={setNotifySound} label={t('onboarding.notifications.sound_title')} description={t('onboarding.notifications.sound_desc')} />
                    </div>
                    <Button size="xs" variant="ghost" icon="volume_up" onClick={() => playNotificationSound()}>
                      {t('onboarding.notifications.test_button')}
                    </Button>
                  </div>
                  <SwitchRow checked={notifyPreview} disabled={!notifyNewMail} onChange={setNotifyPreview} label={t('onboarding.notifications.preview_title')} description={t('onboarding.notifications.preview_desc')} />
                  <SwitchRow checked={autoSync} onChange={setAutoSync} label={t('onboarding.sync.autosync_title')} description={t('onboarding.sync.autosync_desc')} />
                </section>

                <section className="py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={t('onboarding.appearance.default_view_label')}>
                    {({ id }) => (
                      <select id={id} className="select" value={defaultView} onChange={(e) => setDefaultView(e.target.value as DefaultView)}>
                        <option value="mail">{t('onboarding.appearance.view_mail')}</option>
                        <option value="calendar">{t('onboarding.appearance.view_calendar')}</option>
                        <option value="files">{t('onboarding.appearance.view_files')}</option>
                      </select>
                    )}
                  </Field>
                  <Field label={t('onboarding.appearance.sort_label')}>
                    {({ id }) => (
                      <select id={id} className="select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'date_desc' | 'unread_first')}>
                        <option value="date_desc">{t('onboarding.appearance.sort_date_desc')}</option>
                        <option value="unread_first">{t('onboarding.appearance.sort_unread_first')}</option>
                      </select>
                    )}
                  </Field>
                </section>

                <div className="flex items-center gap-2 pt-4 border-t border-line">
                  <Button variant="ghost" icon="arrow_back" onClick={() => setStep(1)}>
                    {t('common.back')}
                  </Button>
                  <span className="flex-1" />
                  <Button variant="primary" size="lg" disabled={!hasAccount} onClick={() => setStep(3)}>
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-6">
                <header>
                  <h2 className="font-bold tracking-[-0.02em] text-2xl text-ink">{t('onboarding.done.title')}</h2>
                  <p className="mt-1 text-sm text-ink-2">{t('onboarding.done.subtitle')}</p>
                </header>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm border-y border-line py-5">
                  <dt className="text-ink-3">{t('onboarding.summary.card_account')}</dt>
                  <dd className="text-ink">{hasAccount ? accounts.map((a) => a.email).join(', ') : t('onboarding.summary.no_account')}</dd>
                  <dt className="text-ink-3">{t('onboarding.summary.card_notifications')}</dt>
                  <dd className="text-ink">{notifyNewMail ? t('onboarding.summary.notif_on', { sound: notifySound ? t('onboarding.summary.notif_sound_suffix') : '' }) : t('onboarding.summary.notif_off')}</dd>
                  <dt className="text-ink-3">{t('onboarding.summary.card_sync')}</dt>
                  <dd className="text-ink">{autoSync ? t('onboarding.summary.sync_push') : t('onboarding.summary.sync_manual')}</dd>
                  <dt className="text-ink-3">{t('onboarding.appearance.default_view_label')}</dt>
                  <dd className="text-ink">{t(`onboarding.appearance.view_${defaultView}`)}</dd>
                </dl>
                <p className="text-xs text-ink-3">{t('onboarding.done.hint')}</p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" icon="arrow_back" onClick={() => setStep(2)}>
                    {t('common.back')}
                  </Button>
                  <span className="flex-1" />
                  <Button variant="primary" size="lg" icon="inbox" disabled={!hasAccount} onClick={finish}>
                    {t('onboarding.done.open')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
