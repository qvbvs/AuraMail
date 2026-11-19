import React, { useState } from 'react'
import type { AccountSecurity, CreateAccountInput, TestConnectionStep } from '@shared/ipc'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { Modal } from './ui/Modal'
import { Button, Icon } from './ui/Button'
import { Field } from './ui/Field'
import { LABEL_COLORS } from './LabelDialog'
import { isValidEmail } from './composer/RecipientField'
import { useTranslation } from '../i18n'

const PRESETS: Record<string, Partial<CreateAccountInput>> = {
  custom: {},
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecurity: 'starttls' },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecurity: 'starttls' },
  homepl: { imapHost: 'poczta.home.pl', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'poczta.home.pl', smtpPort: 587, smtpSecurity: 'starttls' }
}

export const ACCOUNT_COLORS = LABEL_COLORS.slice(0, 8)

interface Props {
  open: boolean
  onClose: () => void
}

const BLANK_FORM: CreateAccountInput = {
  email: '',
  displayName: '',
  imapHost: '',
  imapPort: 993,
  imapSecurity: 'ssl',
  smtpHost: '',
  smtpPort: 587,
  smtpSecurity: 'starttls',
  authType: 'password',
  password: '',
  color: ACCOUNT_COLORS[0]
}

export function AddAccountDialog({ open, onClose }: Props): JSX.Element {
  const { t } = useTranslation()
  const STEP_LABELS: Record<TestConnectionStep['step'], string> = {
    dns: t('addAccount.step.dns'),
    tcp: t('addAccount.step.tcp'),
    tls: t('addAccount.step.tls'),
    auth: t('addAccount.step.auth')
  }
  const createAccount = useAccountsStore((s) => s.create)
  const selectAccount = useAccountsStore((s) => s.select)
  const [form, setForm] = useState<CreateAccountInput>(BLANK_FORM)
  const [testing, setTesting] = useState(false)
  const [imapSteps, setImapSteps] = useState<TestConnectionStep[]>([])
  const [smtpSteps, setSmtpSteps] = useState<TestConnectionStep[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverOpen, setServerOpen] = useState(false)
  const [touched, setTouched] = useState(false)

  const handleClose = (): void => {
    // Clear the form (incl. password) only after closing, so the next open starts clean.
    onClose()
    setTimeout(() => {
      setForm(BLANK_FORM)
      setImapSteps([])
      setSmtpSteps([])
      setError(null)
      setServerOpen(false)
      setTouched(false)
    }, 150)
  }

  const isGmail = form.imapHost === 'imap.gmail.com' || /@(gmail|googlemail)\.com$/i.test(form.email)

  function getEffectivePassword(): string {
    const raw = form.password.trim()
    // Google shows app passwords as four groups of four letters; accept them pasted with spaces.
    if (isGmail && /^[a-zA-Z]{4}\s+[a-zA-Z]{4}\s+[a-zA-Z]{4}\s+[a-zA-Z]{4}$/.test(raw)) return raw.replace(/\s+/g, '')
    return raw
  }

  function applyPreset(name: string): void {
    setForm((f) => ({ ...f, ...(PRESETS[name] ?? {}) }))
  }

  function update<K extends keyof CreateAccountInput>(key: K, value: CreateAccountInput[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleEmailChange(value: string): void {
    update('email', value)
    if (/@(gmail|googlemail)\.com$/i.test(value) && (!form.imapHost || form.imapHost === 'imap.example.com')) applyPreset('gmail')
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true)
    setImapSteps([])
    setSmtpSteps([])
    setError(null)
    const password = getEffectivePassword()
    try {
      const [imap, smtp] = await Promise.all([
        window.mailapp.accounts.testConnection({ host: form.imapHost, port: form.imapPort, security: form.imapSecurity, protocol: 'imap', email: form.email.trim(), password }),
        window.mailapp.accounts.testConnection({ host: form.smtpHost, port: form.smtpPort, security: form.smtpSecurity, protocol: 'smtp', email: form.email.trim(), password })
      ])
      setImapSteps(imap)
      setSmtpSteps(smtp)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const emailError = touched && form.email && !isValidEmail(form.email.trim()) ? t('addAccount.email_invalid') : null
  const canSubmit = isValidEmail(form.email.trim()) && !!form.imapHost && !!form.smtpHost && !!form.password

  async function handleSubmit(): Promise<void> {
    setTouched(true)
    if (!canSubmit) {
      if (!form.imapHost || !form.smtpHost) setServerOpen(true)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAccount({ ...form, email: form.email.trim(), password: getEffectivePassword() })
      handleClose()
      if (created?.id) {
        selectAccount(created.id)
        await useMailStore.getState().loadFolders(created.id, { forceInbox: true })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function renderSteps(label: string, steps: TestConnectionStep[]): JSX.Element | null {
    if (steps.length === 0) return null
    return (
      <div>
        <p className="eyebrow mb-1">{label}</p>
        <ul className="flex flex-col gap-1">
          {steps.map((s) => (
            <li key={s.step} className="flex items-start gap-2 text-xs">
              <Icon name={s.ok ? 'check_circle' : 'cancel'} className={`!text-[16px] ${s.ok ? 'text-ok' : 'text-danger'}`} />
              <span className="text-ink-2">
                <span className="text-ink font-medium">{STEP_LABELS[s.step]}</span> — {s.message}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const serverColumn = (kind: 'imap' | 'smtp'): JSX.Element => {
    const host = kind === 'imap' ? 'imapHost' : 'smtpHost'
    const port = kind === 'imap' ? 'imapPort' : 'smtpPort'
    const sec = kind === 'imap' ? 'imapSecurity' : 'smtpSecurity'
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="eyebrow mb-2">{t(`addAccount.${kind}_section_title`)}</legend>
        <Field label={t(`addAccount.${kind}_host_label`)} error={touched && !form[host] ? t('addAccount.required') : null}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={form[host]}
              onChange={(e) => update(host, e.target.value.trim())}
              placeholder={t(`addAccount.${kind}_placeholder`)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              spellCheck={false}
            />
          )}
        </Field>
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <Field label={t('addAccount.port')}>
            {({ id }) => <input id={id} type="number" min={1} max={65535} className="input" value={form[port]} onChange={(e) => update(port, Number(e.target.value) || 0)} />}
          </Field>
          <Field label={t('addAccount.security')}>
            {({ id }) => (
              <select id={id} className="select" value={form[sec]} onChange={(e) => update(sec, e.target.value as AccountSecurity)}>
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

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title={t('addAccount.title')}
      footer={
        <>
          <Button size="sm" variant="ghost" icon="lan" disabled={testing || !form.email || !form.imapHost} loading={testing} onClick={handleTestConnection} className="mr-auto">
            {t('addAccount.test_connection')}
          </Button>
          <Button size="sm" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="sm" loading={submitting} onClick={handleSubmit}>
            {t('addAccount.save_account')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <p className="text-sm text-ink-2 -mt-1">{t('addAccount.header_subtitle')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('addAccount.email_label')} error={emailError}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="email"
                autoComplete="email"
                className="input"
                value={form.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t('addAccount.email_placeholder')}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                spellCheck={false}
              />
            )}
          </Field>
          <Field label={t('addAccount.displayName_label')}>
            {({ id }) => <input id={id} className="input" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder={t('addAccount.displayName_placeholder')} />}
          </Field>
        </div>

        <Field
          label={isGmail ? t('addAccount.password_label_gmail') : t('addAccount.password_label_default')}
          hint={isGmail ? t('addAccount.gmail_password_hint') : undefined}
          error={touched && !form.password ? t('addAccount.required') : null}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="password"
              autoComplete="current-password"
              className="input font-mono"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder={isGmail ? t('addAccount.password_placeholder_gmail') : ''}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>

        {isGmail && (
          <div className="rounded border border-line bg-sunken/60 px-4 py-3 text-xs text-ink-2">
            <p className="font-medium text-ink flex items-center gap-1.5">
              <Icon name="key" className="!text-[16px]" />
              {t('addAccount.gmail_app_password_required')}
            </p>
            <p className="mt-1 leading-relaxed">{t('addAccount.gmail_app_password_desc')}</p>
            <ol className="mt-2 list-decimal pl-4 flex flex-col gap-1">
              <li>{t('addAccount.gmail_step1')}</li>
              <li>
                {t('addAccount.gmail_step2_prefix')}{' '}
                <button type="button" className="text-accent-ink underline underline-offset-2" onClick={() => window.mailapp.shell.openExternal('https://myaccount.google.com/apppasswords')}>
                  myaccount.google.com/apppasswords
                </button>
              </li>
              <li>{t('addAccount.gmail_step3', { app: 'AuraMail' })}</li>
            </ol>
          </div>
        )}

        <fieldset>
          <legend className="field-label mb-2">{t('addAccount.color_label')}</legend>
          <div className="flex gap-1.5" role="radiogroup">
            {ACCOUNT_COLORS.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="account-color" className="peer sr-only" checked={form.color === c} onChange={() => update('color', c)} aria-label={c} />
                <span
                  className="block w-6 h-6 rounded border-2 border-transparent peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                  style={{ backgroundColor: c, boxShadow: 'inset 0 0 0 2px var(--raised)' }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <section className="border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-1.5 text-sm font-medium text-ink" aria-expanded={serverOpen} onClick={() => setServerOpen((v) => !v)}>
              <Icon name={serverOpen ? 'expand_more' : 'chevron_right'} className="text-ink-3" />
              {t('addAccount.server_settings')}
            </button>
            <span className="flex-1 truncate text-xs text-ink-3">{!serverOpen && form.imapHost ? `${form.imapHost} · ${form.smtpHost}` : ''}</span>
            <label className="sr-only" htmlFor="account-preset">
              {t('addAccount.preset_label')}
            </label>
            <select
              id="account-preset"
              className="select !h-7 !w-auto !text-xs"
              defaultValue="custom"
              onChange={(e) => {
                applyPreset(e.target.value)
                if (e.target.value === 'custom') setServerOpen(true)
              }}
            >
              <option value="custom">{t('addAccount.preset_custom')}</option>
              <option value="gmail">{t('addAccount.preset_gmail')}</option>
              <option value="outlook">{t('addAccount.preset_outlook')}</option>
              <option value="homepl">{t('addAccount.preset_homepl')}</option>
            </select>
          </div>
          {serverOpen && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {serverColumn('imap')}
              {serverColumn('smtp')}
            </div>
          )}
        </section>

        {(imapSteps.length > 0 || smtpSteps.length > 0) && (
          <section className="rounded border border-line px-4 py-3 flex flex-col gap-3" aria-live="polite">
            <h3 className="text-sm font-medium text-ink">{t('addAccount.diagnostics_title')}</h3>
            {renderSteps('IMAP', imapSteps)}
            {renderSteps('SMTP', smtpSteps)}
          </section>
        )}

        {error && (
          <div role="alert" className="rounded bg-danger-soft text-danger px-4 py-3 text-xs flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 font-medium">
              <Icon name="error" className="!text-[16px]" />
              {error}
            </span>
            {isGmail && <span className="text-ink-2">{t('addAccount.gmail_error_hint')}</span>}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
