import React, { useState } from 'react'
import type { AccountSecurity, CreateAccountInput, TestConnectionStep } from '@shared/ipc'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { useTranslation } from '../i18n'

const PRESETS: Record<string, Partial<CreateAccountInput>> = {
  custom: {},
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecurity: 'starttls' },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecurity: 'starttls' },
  homepl: { imapHost: 'poczta.home.pl', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'poczta.home.pl', smtpPort: 587, smtpSecurity: 'starttls' }
}

const ACCOUNT_COLORS = [
  '#4f46e5',
  '#0284c7',
  '#0d9488',
  '#16a34a',
  '#d97706',
  '#e11d48',
  '#7c3aed'
]

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
  color: '#4f46e5'
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

  const handleClose = (): void => {
    // Wyczyść formularz (w tym hasło) dopiero po zamknięciu — użytkownik odzyskuje
    // czysty stan przy kolejnym otwarciu zamiast poprzednio wpisanych danych.
    onClose()
    setTimeout(() => {
      setForm(BLANK_FORM)
      setImapSteps([])
      setSmtpSteps([])
      setError(null)
    }, 150)
  }

  const isGmail = form.imapHost === 'imap.gmail.com' || /@(gmail|googlemail)\.com$/i.test(form.email)

  function getEffectivePassword(): string {
    const raw = form.password.trim()
    if (isGmail && /^[a-zA-Z]{4}\s+[a-zA-Z]{4}\s+[a-zA-Z]{4}\s+[a-zA-Z]{4}$/.test(raw)) {
      return raw.replace(/\s+/g, '')
    }
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
    if (/@(gmail|googlemail)\.com$/i.test(value) && (!form.imapHost || form.imapHost === 'imap.example.com')) {
      applyPreset('gmail')
    }
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true)
    setImapSteps([])
    setSmtpSteps([])
    setError(null)
    const effectivePassword = getEffectivePassword()
    try {
      const [imap, smtp] = await Promise.all([
        window.mailapp.accounts.testConnection({
          host: form.imapHost,
          port: form.imapPort,
          security: form.imapSecurity,
          protocol: 'imap',
          email: form.email.trim(),
          password: effectivePassword
        }),
        window.mailapp.accounts.testConnection({
          host: form.smtpHost,
          port: form.smtpPort,
          security: form.smtpSecurity,
          protocol: 'smtp',
          email: form.email.trim(),
          password: effectivePassword
        })
      ])
      setImapSteps(imap)
      setSmtpSteps(smtp)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const effectivePassword = getEffectivePassword()
      const createdAccount = await createAccount({
        ...form,
        email: form.email.trim(),
        password: effectivePassword
      })
      handleClose()
      if (createdAccount?.id) {
        selectAccount(createdAccount.id)
        await useMailStore.getState().loadFolders(createdAccount.id, { forceInbox: true })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function renderSteps(steps: TestConnectionStep[]): JSX.Element | null {
    if (steps.length === 0) return null
    return (
      <ul className="space-y-1 my-1">
        {steps.map((s) => (
          <li
            key={s.step}
            className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-lg ${
              s.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            }`}
          >
            <span className="font-bold">{s.ok ? '✓' : '✗'}</span>
            <span>
              <strong>{STEP_LABELS[s.step]}</strong>: {s.message}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-primary dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40 flex-shrink-0">
            <span className="material-symbols-outlined text-[19px]">add_link</span>
          </span>
          <span className="flex flex-col">
            <span>{t('addAccount.title')}</span>
            <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 -mt-0.5">
              {t('addAccount.header_subtitle')}
            </span>
          </span>
        </span>
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={testing || !form.email || !form.imapHost}
            loading={testing}
            onClick={handleTestConnection}
            className="mr-auto"
          >
            {t('addAccount.test_connection')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!form.email || !form.imapHost}
            loading={submitting}
            onClick={handleSubmit}
          >
            {t('addAccount.save_account')}
          </Button>
        </>
      }
    >
      <div className="text-slate-800 dark:text-slate-100 space-y-4 -m-2">
        {/* Content Body */}
        <div className="p-2 space-y-4">
          {/* Preset Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t('addAccount.preset_label')}
            </label>
            <select
              onChange={(e) => applyPreset(e.target.value)}
              defaultValue="custom"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="custom">{t('addAccount.preset_custom')}</option>
              <option value="gmail">{t('addAccount.preset_gmail')}</option>
              <option value="outlook">{t('addAccount.preset_outlook')}</option>
              <option value="homepl">{t('addAccount.preset_homepl')}</option>
            </select>
          </div>

          {/* Identity & Credentials Card */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.06] space-y-3">
            <div className="font-semibold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
              {t('addAccount.credentials_title')}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('addAccount.email_label')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder={t('addAccount.email_placeholder')}
                  className="w-full px-3 py-2 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">{t('addAccount.displayName_label')}</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => update('displayName', e.target.value)}
                  placeholder={t('addAccount.displayName_placeholder')}
                  className="w-full px-3 py-2 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {isGmail && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <span className="material-symbols-outlined text-[17px]">vpn_key</span>
                  <span>{t('addAccount.gmail_app_password_required')}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('addAccount.gmail_app_password_desc')}
                </p>
                <ol className="list-decimal list-inside text-[11px] text-slate-600 dark:text-slate-300 space-y-1 pl-0.5">
                  <li>{t('addAccount.gmail_step1')}</li>
                  <li>
                    {t('addAccount.gmail_step2_prefix')}{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      myaccount.google.com/apppasswords
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  </li>
                  <li>{t('addAccount.gmail_step3', { app: 'AuraMail' })}</li>
                </ol>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {isGmail ? t('addAccount.password_label_gmail') : t('addAccount.password_label_default')}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder={isGmail ? t('addAccount.password_placeholder_gmail') : '••••••••'}
                className="w-full px-3 py-2 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-primary/50 font-mono tracking-wide"
              />
              {isGmail && (
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  {t('addAccount.gmail_password_hint')}
                </span>
              )}
            </div>

            {/* Account color picker */}
            <div>
              <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                {t('addAccount.color_label')}
              </span>
              <div className="flex gap-2">
                {ACCOUNT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update('color', c)}
                    className="w-5 h-5 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      transform: form.color === c ? 'scale(1.25)' : 'scale(1)',
                      boxShadow: form.color === c ? '0 0 0 2px #fff, 0 0 0 4px ' + c : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Server Config Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* IMAP column */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.06] space-y-2">
              <div className="font-bold text-xs text-primary dark:text-indigo-400">
                {t('addAccount.imap_section_title')}
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">{t('addAccount.imap_host_label')}</label>
                <input
                  type="text"
                  value={form.imapHost}
                  onChange={(e) => update('imapHost', e.target.value)}
                  placeholder={t('addAccount.imap_placeholder')}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">{t('addAccount.port')}</label>
                  <input
                    type="number"
                    value={form.imapPort}
                    onChange={(e) => update('imapPort', Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">{t('addAccount.security')}</label>
                  <select
                    value={form.imapSecurity}
                    onChange={(e) => update('imapSecurity', e.target.value as AccountSecurity)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs"
                  >
                    <option value="ssl">{t('addAccount.security_ssl')}</option>
                    <option value="starttls">{t('addAccount.security_starttls')}</option>
                    <option value="none">{t('addAccount.security_none')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SMTP column */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.06] space-y-2">
              <div className="font-bold text-xs text-secondary dark:text-cyan-400">
                {t('addAccount.smtp_section_title')}
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">{t('addAccount.smtp_host_label')}</label>
                <input
                  type="text"
                  value={form.smtpHost}
                  onChange={(e) => update('smtpHost', e.target.value)}
                  placeholder={t('addAccount.smtp_placeholder')}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">{t('addAccount.port')}</label>
                  <input
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) => update('smtpPort', Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">{t('addAccount.security')}</label>
                  <select
                    value={form.smtpSecurity}
                    onChange={(e) => update('smtpSecurity', e.target.value as AccountSecurity)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs"
                  >
                    <option value="ssl">{t('addAccount.security_ssl')}</option>
                    <option value="starttls">{t('addAccount.security_starttls')}</option>
                    <option value="none">{t('addAccount.security_none')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Diagnostic steps breakdown */}
          {(imapSteps.length > 0 || smtpSteps.length > 0) && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.06] space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('addAccount.diagnostics_title')}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">IMAP:</span>
                {renderSteps(imapSteps)}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">SMTP:</span>
                {renderSteps(smtpSteps)}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{error}</span>
              </div>
              {isGmail && (
                <div className="text-[11px] text-rose-700 dark:text-rose-300 pt-1 border-t border-rose-200 dark:border-rose-900/40">
                  {t('addAccount.gmail_error_hint')}{' '}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-semibold hover:text-rose-950 dark:hover:text-white inline-flex items-center gap-0.5"
                  >
                    myaccount.google.com/apppasswords
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
