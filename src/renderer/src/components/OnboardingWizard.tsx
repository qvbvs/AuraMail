import React, { useState, useEffect } from 'react'
import { useTheme, type ThemeMode } from '../theme/ThemeContext'
import { useAccountsStore } from '../state/accounts-store'
import { playNotificationSound } from '../utils/sound'
import { useTranslation } from '../i18n'
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
  gmail: {
    nameKey: 'onboarding.provider.gmail_name',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecurity: 'ssl',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecurity: 'ssl',
    tipKey: 'onboarding.provider.gmail_tip'
  },
  outlook: {
    nameKey: 'onboarding.provider.outlook_name',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecurity: 'ssl',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecurity: 'starttls',
    tipKey: 'onboarding.provider.outlook_tip'
  },
  onet: {
    nameKey: 'onboarding.provider.onet_name',
    imapHost: 'imap.poczta.onet.pl',
    imapPort: 993,
    imapSecurity: 'ssl',
    smtpHost: 'smtp.poczta.onet.pl',
    smtpPort: 465,
    smtpSecurity: 'ssl'
  },
  wp: {
    nameKey: 'onboarding.provider.wp_name',
    imapHost: 'imap.wp.pl',
    imapPort: 993,
    imapSecurity: 'ssl',
    smtpHost: 'smtp.wp.pl',
    smtpPort: 465,
    smtpSecurity: 'ssl'
  },
  interia: {
    nameKey: 'onboarding.provider.interia_name',
    imapHost: 'poczta.interia.pl',
    imapPort: 993,
    imapSecurity: 'ssl',
    smtpHost: 'poczta.interia.pl',
    smtpPort: 465,
    smtpSecurity: 'ssl'
  },
  custom: {
    nameKey: 'onboarding.provider.custom_name',
    imapHost: '',
    imapPort: 993,
    imapSecurity: 'ssl',
    smtpHost: '',
    smtpPort: 465,
    smtpSecurity: 'ssl'
  }
}

const PRESET_COLORS = [
  '#4f46e5', // Indigo
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#059669', // Emerald
  '#d97706', // Amber
  '#e11d48', // Rose
  '#9333ea', // Purple
  '#475569'  // Slate
]

export function OnboardingWizard({ onComplete }: OnboardingWizardProps): JSX.Element {
  const [step, setStep] = useState<number>(1)
  const { theme, setTheme } = useTheme()
  const { language, setLanguage, t } = useTranslation()
  const { accounts, load: loadAccounts, create: createAccount } = useAccountsStore()

  // Krok 2: Formularz konta
  const [provider, setProvider] = useState<ProviderPreset>('gmail')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [imapHost, setImapHost] = useState(PROVIDERS.gmail.imapHost)
  const [imapPort, setImapPort] = useState(PROVIDERS.gmail.imapPort)
  const [imapSecurity, setImapSecurity] = useState<AccountSecurity>(PROVIDERS.gmail.imapSecurity)
  const [smtpHost, setSmtpHost] = useState(PROVIDERS.gmail.smtpHost)
  const [smtpPort, setSmtpPort] = useState(PROVIDERS.gmail.smtpPort)
  const [smtpSecurity, setSmtpSecurity] = useState<AccountSecurity>(PROVIDERS.gmail.smtpSecurity)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestConnectionStep[] | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false)

  // Krok 3: Synchronizacja
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [syncFrequencySec, setSyncFrequencySec] = useState(300)
  const [syncMessageLimit, setSyncMessageLimit] = useState(200)
  const [syncAllFolders, setSyncAllFolders] = useState(true)

  // Krok 4: Powiadomienia
  const [notifyNewMail, setNotifyNewMail] = useState(true)
  const [notifyDesktop, setNotifyDesktop] = useState(true)
  const [notifySound, setNotifySound] = useState(true)
  const [notifyPreview, setNotifyPreview] = useState(true)

  // Krok 5: Wygląd i zachowanie
  const [defaultView, setDefaultView] = useState<'mail' | 'calendar' | 'files'>('mail')
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'unread_first'>('date_desc')

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const handleProviderChange = (newProvider: ProviderPreset): void => {
    setProvider(newProvider)
    const cfg = PROVIDERS[newProvider]
    setImapHost(cfg.imapHost)
    setImapPort(cfg.imapPort)
    setImapSecurity(cfg.imapSecurity)
    setSmtpHost(cfg.smtpHost)
    setSmtpPort(cfg.smtpPort)
    setSmtpSecurity(cfg.smtpSecurity)
    setTestResults(null)
    setAccountError(null)
  }

  const handleTestConnection = async (): Promise<boolean> => {
    if (!email.trim() || !password.trim() || !imapHost.trim()) {
      setAccountError(t('onboarding.error.fill_credentials'))
      return false
    }

    setIsTesting(true)
    setTestResults(null)
    setAccountError(null)

    try {
      const results = await window.mailapp.accounts.testConnection({
        host: imapHost,
        port: imapPort,
        security: imapSecurity,
        protocol: 'imap',
        email: email.trim(),
        password
      })
      setTestResults(results)
      const allPassed = results.every((r) => r.ok)
      if (!allPassed) {
        const failed = results.find((r) => !r.ok)
        setAccountError(failed?.message || t('onboarding.error.test_failed'))
      }
      return allPassed
    } catch (err) {
      setAccountError((err as Error).message)
      return false
    } finally {
      setIsTesting(false)
    }
  }

  const handleAddAccount = async (): Promise<boolean> => {
    if (!email.trim() || !password.trim()) {
      setAccountError(t('onboarding.error.provide_email_pass'))
      return false
    }

    setIsSubmittingAccount(true)
    setAccountError(null)

    try {
      const input: CreateAccountInput = {
        email: email.trim(),
        displayName: displayName.trim() || email.trim().split('@')[0],
        imapHost,
        imapPort,
        imapSecurity,
        smtpHost,
        smtpPort,
        smtpSecurity,
        authType: 'password',
        password,
        color
      }
      await createAccount(input)
      await loadAccounts()
      return true
    } catch (err) {
      setAccountError((err as Error).message)
      return false
    } finally {
      setIsSubmittingAccount(false)
    }
  }

  const handleFinishWizard = async (): Promise<void> => {
    try {
      // Zapisz preferencje użytkownika w SQLite
      await Promise.all([
        window.mailapp.settings.set('autoSyncEnabled', String(autoSyncEnabled)),
        window.mailapp.settings.set('syncFrequencySec', String(syncFrequencySec)),
        window.mailapp.settings.set('syncMessageLimit', String(syncMessageLimit)),
        window.mailapp.settings.set('syncAllFolders', String(syncAllFolders)),
        window.mailapp.settings.set('notifyNewMail', String(notifyNewMail)),
        window.mailapp.settings.set('notifyDesktop', String(notifyDesktop)),
        window.mailapp.settings.set('notifySound', String(notifySound)),
        window.mailapp.settings.set('notifyPreview', String(notifyPreview)),
        window.mailapp.settings.set('theme', theme),
        window.mailapp.settings.set('defaultView', defaultView),
        window.mailapp.settings.set('sortOrder', sortOrder),
        window.mailapp.settings.set('app_language', language),
        window.mailapp.settings.set('onboardingCompleted', 'true')
      ])
      localStorage.setItem('app_language', language)
      localStorage.setItem('onboardingCompleted', 'true')
    } catch {
      // ignore
    }

    onComplete()
  }

  const hasConfiguredAccount = accounts.length > 0

  return (
    <div className="w-screen h-screen min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden select-none">
      {/* Top Application Fullscreen Header */}
      <header className="w-full flex-shrink-0 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#101524] px-6 lg:px-12 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md font-bold text-base">
            <span className="material-symbols-outlined text-[20px]">mail</span>
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>AuraMail</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40 uppercase tracking-wider">
                {t('onboarding.welcome_badge', undefined, 'Pierwsza konfiguracja')}
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('onboarding.step', { current: step, total: 6 }, `Krok ${step} z 6`)}: {
                step === 1 ? t('onboarding.step.welcome', undefined, 'Powitanie') :
                step === 2 ? t('onboarding.step.account', undefined, 'Konto pocztowe') :
                step === 3 ? t('onboarding.step.sync', undefined, 'Synchronizacja') :
                step === 4 ? t('onboarding.step.notifications', undefined, 'Powiadomienia') :
                step === 5 ? t('onboarding.step.appearance', undefined, 'Wygląd i zachowanie') :
                t('onboarding.step.summary', undefined, 'Podsumowanie')
              }
            </div>
          </div>
        </div>

        {/* Stepper Navigation */}
        <div className="hidden sm:flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <button
              key={i}
              type="button"
              disabled={i > 2 && !hasConfiguredAccount}
              onClick={() => {
                if (i <= step || (hasConfiguredAccount && i <= 6)) {
                  setStep(i)
                }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                i === step
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                  : i < step
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                  : 'text-slate-400 dark:text-slate-600 cursor-not-allowed bg-slate-100 dark:bg-slate-800/30'
              }`}
            >
              <span>{i}</span>
              <span className="hidden md:inline text-[11px]">
                {i === 1 ? t('onboarding.step.welcome', undefined, 'Powitanie') :
                 i === 2 ? t('onboarding.step.account', undefined, 'Konto') :
                 i === 3 ? t('onboarding.step.sync', undefined, 'Sync') :
                 i === 4 ? t('onboarding.step.notifications', undefined, 'Powiadomienia') :
                 i === 5 ? t('onboarding.step.appearance', undefined, 'Wygląd') :
                 t('onboarding.step.summary', undefined, 'Koniec')}
              </span>
            </button>
          ))}
        </div>

        {/* Language switcher & Skip button */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200/80 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setLanguage('pl')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                language === 'pl'
                  ? 'bg-white dark:bg-[#1c2436] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title={t('onboarding.lang_pl_title')}
            >
              <span>🇵🇱</span>
              <span className="font-bold">PL</span>
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                language === 'en'
                  ? 'bg-white dark:bg-[#1c2436] text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title={t('onboarding.lang_en_title')}
            >
              <span>🇬🇧</span>
              <span className="font-bold">EN</span>
            </button>
          </div>

          {step > 2 && step < 6 && (
            <button
              type="button"
              onClick={() => setStep(6)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1"
            >
              <span>{t('onboarding.skip_optional', undefined, 'Pomiń opcjonalne')}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          )}
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200/70 dark:bg-white/[0.04] h-1 flex-shrink-0">
        <div
          className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </div>

      {/* Fullscreen Page Content */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 flex flex-col items-center justify-start">
        <div className="w-full max-w-3xl my-auto bg-white dark:bg-[#121826] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm p-6 sm:p-10 transition-all">
          {/* KROK 1: POWITANIE */}
          {step === 1 && (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6 shadow-sm">
                <span className="material-symbols-outlined text-[36px]">mail_lock</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {t('onboarding.welcome.title', undefined, 'Witaj w AuraMail')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mb-6 leading-relaxed">
                {t('onboarding.welcome.desc', undefined, 'Nowoczesny, bezpieczny klient poczty z lokalnym szyfrowaniem bazy, synchronizacją w czasie rzeczywistym i inteligentnym asystentem wątków.')}
              </p>

              {/* Wybór języka na pierwszym ekranie */}
              <div className="w-full max-w-md mb-8 p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5 flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">translate</span>
                  <span>{t('onboarding.welcome.lang_label', undefined, 'Wybierz język aplikacji / Select application language:')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLanguage('pl')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                      language === 'pl'
                        ? 'border-indigo-600 bg-white dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-white/[0.08] bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-2xl">🇵🇱</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>{t('onboarding.lang_pl_name')}</span>
                        {language === 'pl' && <span className="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">check_circle</span>}
                      </div>
                      <div className="text-[10px] text-slate-500">{t('onboarding.lang_pl_default')}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                      language === 'en'
                        ? 'border-indigo-600 bg-white dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-white/[0.08] bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-2xl">🇬🇧</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>{t('onboarding.lang_en_name')}</span>
                        {language === 'en' && <span className="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">check_circle</span>}
                      </div>
                      <div className="text-[10px] text-slate-500">{t('onboarding.lang_en_default')}</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mb-8 text-left">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/[0.04]">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[20px] mb-1">bolt</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('onboarding.welcome.feature1.title', undefined, 'Push IMAP IDLE')}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('onboarding.welcome.feature1.desc', undefined, 'Powiadomienia od razu po nadejściu poczty.')}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/[0.04]">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[20px] mb-1">security</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('onboarding.welcome.feature2.title', undefined, 'Pełna prywatność')}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('onboarding.welcome.feature2.desc', undefined, 'Hasła w bezpiecznym magazynie Windows Keytar.')}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/[0.04]">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[20px] mb-1">mark_email_read</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('onboarding.welcome.feature3.title', undefined, 'Zero przestojów')}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('onboarding.welcome.feature3.desc', undefined, 'Brak pustych ekranów podczas błędów sieci.')}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.99] flex items-center gap-2"
              >
                <span>{t('onboarding.welcome.start_btn', undefined, 'Rozpocznij konfigurację')}</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          )}

          {/* KROK 2: KONTO POCZTOWE */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.account.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('onboarding.account.subtitle')}
                </p>
              </div>

              {/* Jeśli konto już jest podłączone */}
              {hasConfiguredAccount && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-emerald-600 text-[24px]">check_circle</span>
                    <div>
                      <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        {accounts[0].email}
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {t('onboarding.account.connected_host', { host: accounts[0].imapHost })}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('onboarding.account.ready')}</span>
                </div>
              )}

              {/* Wybór dostawcy */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('onboarding.account.provider_label')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(PROVIDERS) as ProviderPreset[]).map((pKey) => (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => handleProviderChange(pKey)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-all ${
                        provider === pKey
                          ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs'
                          : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t(PROVIDERS[pKey].nameKey)}
                    </button>
                  ))}
                </div>
              </div>

              {PROVIDERS[provider].tipKey && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-amber-600 mt-0.5">info</span>
                  <span>{t(PROVIDERS[provider].tipKey as string)}</span>
                </div>
              )}

              {/* Pola podstawowe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('onboarding.account.email_label')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('addAccount.email_placeholder')}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/[0.08] text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('onboarding.account.displayName_label')}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('onboarding.account.displayName_placeholder')}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/[0.08] text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('onboarding.account.password_label')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/[0.08] text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('onboarding.account.color_label')}
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full transition-transform ${
                          color === c ? 'ring-2 ring-offset-2 ring-indigo-600 scale-110' : 'hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Sekcja zaawansowana IMAP/SMTP */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showAdvanced ? 'expand_less' : 'expand_more'}
                  </span>
                  <span>{showAdvanced ? t('onboarding.account.hide_servers') : t('onboarding.account.show_servers')}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/[0.06] flex flex-col gap-3 text-xs">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-0.5">{t('onboarding.account.imap_host_label')}</label>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08]"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-0.5">{t('onboarding.account.imap_port_label')}</label>
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-0.5">{t('onboarding.account.smtp_host_label')}</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08]"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-0.5">{t('onboarding.account.smtp_port_label')}</label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Wyniki testu diagnostycznego */}
              {testResults && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.08] flex flex-col gap-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('onboarding.account.diagnostics_title')}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {testResults.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs">
                        <span className={`material-symbols-outlined text-[16px] ${step.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {step.ok ? 'check_circle' : 'cancel'}
                        </span>
                        <span className="capitalize font-mono text-[11px]">{step.step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {accountError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{accountError}</span>
                </div>
              )}

              {/* Akcje kroku 2 */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  disabled={isTesting}
                  onClick={handleTestConnection}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {isTesting ? t('addAccount.testing') : t('addAccount.test_connection')}
                </button>

                <div className="flex items-center gap-2">
                  {hasConfiguredAccount && (
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {t('onboarding.account.continue_existing')}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isSubmittingAccount || (!email && !hasConfiguredAccount)}
                    onClick={async () => {
                      if (email.trim() && password.trim()) {
                        const ok = await handleAddAccount()
                        if (ok) setStep(3)
                      } else if (hasConfiguredAccount) {
                        setStep(3)
                      }
                    }}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-all"
                  >
                    {isSubmittingAccount ? t('onboarding.account.saving') : t('onboarding.account.save_continue')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* KROK 3: SYNCHRONIZACJA */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.sync.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('onboarding.sync.subtitle2')}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04]">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.sync.autosync_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.sync.autosync_desc')}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.sync.frequency_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.sync.frequency_desc')}
                    </div>
                  </div>
                  <select
                    value={syncFrequencySec}
                    onChange={(e) => setSyncFrequencySec(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] text-xs font-medium"
                  >
                    <option value={60}>{t('onboarding.sync.every_1m_short')}</option>
                    <option value={300}>{t('onboarding.sync.every_5m_short')}</option>
                    <option value={900}>{t('onboarding.sync.every_15m_short')}</option>
                    <option value={1800}>{t('onboarding.sync.every_30m_short')}</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.sync.scope_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.sync.scope_desc')}
                    </div>
                  </div>
                  <select
                    value={syncMessageLimit}
                    onChange={(e) => setSyncMessageLimit(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] text-xs font-medium"
                  >
                    <option value={50}>{t('onboarding.sync.limit_50')}</option>
                    <option value={100}>{t('onboarding.sync.limit_100')}</option>
                    <option value={200}>{t('onboarding.sync.limit_200')}</option>
                    <option value={500}>{t('onboarding.sync.limit_500')}</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04]">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.sync.all_folders_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.sync.all_folders_desc')}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={syncAllFolders}
                    onChange={(e) => setSyncAllFolders(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ← {t('common.back')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  {t('common.next')}: {t('onboarding.step.notifications')} →
                </button>
              </div>
            </div>
          )}

          {/* KROK 4: POWIADOMIENIA */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.notifications.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('onboarding.notifications.subtitle2')}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04]">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.notifications.newmail_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.notifications.newmail_desc')}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyNewMail}
                    onChange={(e) => setNotifyNewMail(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04]">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.notifications.desktop_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.notifications.desktop_desc')}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyDesktop}
                    onChange={(e) => setNotifyDesktop(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04]">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.notifications.sound_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.notifications.sound_desc')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => playNotificationSound()}
                      className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-[11px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1"
                      title={t('onboarding.notifications.test_sound')}
                    >
                      <span className="material-symbols-outlined text-[14px]">volume_up</span>
                      <span>{t('onboarding.notifications.test_button')}</span>
                    </button>
                    <input
                      type="checkbox"
                      checked={notifySound}
                      onChange={(e) => setNotifySound(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04]">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t('onboarding.notifications.preview_title')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('onboarding.notifications.preview_desc')}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyPreview}
                    onChange={(e) => setNotifyPreview(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ← {t('common.back')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  {t('common.next')}: {t('onboarding.step.appearance')} →
                </button>
              </div>
            </div>
          )}

          {/* KROK 5: WYGLĄD I ZACHOWANIE */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.appearance.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('onboarding.appearance.subtitle2')}
                </p>
              </div>

              {/* Motyw graficzny */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('onboarding.appearance.theme', undefined, 'Motyw kolorystyczny')}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTheme(m)}
                      className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition-all ${
                        theme === m
                          ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                          : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">
                        {m === 'light' ? 'light_mode' : m === 'dark' ? 'dark_mode' : 'brightness_auto'}
                      </span>
                      <span className="text-xs font-semibold">
                        {m === 'light' ? t('onboarding.appearance.theme.light', undefined, 'Jasny') :
                         m === 'dark' ? t('onboarding.appearance.theme.dark', undefined, 'Ciemny') :
                         t('onboarding.appearance.theme.system', undefined, 'Systemowy')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Język aplikacji */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('onboarding.appearance.language', undefined, 'Język interfejsu (Language)')}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setLanguage('pl')}
                    className={`p-3 rounded-xl border text-center flex items-center justify-center gap-2.5 transition-all ${
                      language === 'pl'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xl">🇵🇱</span>
                    <span className="text-xs font-semibold">{t('onboarding.lang_pl_name')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`p-3 rounded-xl border text-center flex items-center justify-center gap-2.5 transition-all ${
                      language === 'en'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xl">🇬🇧</span>
                    <span className="text-xs font-semibold">{t('onboarding.lang_en_name')}</span>
                  </button>
                </div>
              </div>

              {/* Domyślny widok */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('onboarding.appearance.default_view_label')}
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'mail', label: t('onboarding.appearance.view_mail'), icon: 'inbox' },
                    { id: 'calendar', label: t('onboarding.appearance.view_calendar'), icon: 'calendar_today' },
                    { id: 'files', label: t('onboarding.appearance.view_files'), icon: 'folder_open' }
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setDefaultView(v.id as any)}
                      className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition-all ${
                        defaultView === v.id
                          ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                          : 'border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{v.icon}</span>
                      <span className="text-xs font-medium">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sortowanie wiadomości */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('onboarding.appearance.sort_label')}
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-800 dark:text-slate-100"
                >
                  <option value="date_desc">{t('onboarding.appearance.sort_date_desc')}</option>
                  <option value="unread_first">{t('onboarding.appearance.sort_unread_first')}</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ← {t('common.back', undefined, 'Wstecz')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(6)}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  {t('common.next', undefined, 'Dalej')}: {t('onboarding.step.summary', undefined, 'Podsumowanie')} →
                </button>
              </div>
            </div>
          )}

          {/* KROK 6: PODSUMOWANIE */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('onboarding.summary.title', undefined, 'Podsumowanie konfiguracji')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('onboarding.summary.subtitle', undefined, 'Przejrzyj wybrane ustawienia przed przejściem do skrzynki odbiorczej.')}
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {/* Karta: Język */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('onboarding.appearance.language', undefined, 'Język aplikacji')}</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-2">
                      <span>{language === 'pl' ? `🇵🇱 ${t('onboarding.lang_pl_name')}` : `🇬🇧 ${t('onboarding.lang_en_name')}`}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {t('common.edit', undefined, 'Zmień')}
                  </button>
                </div>

                {/* Karta: Konto */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('onboarding.summary.card_account')}</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {accounts[0]?.email || email || t('onboarding.summary.no_account')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {displayName || accounts[0]?.displayName || t('onboarding.summary.default_name')} • IMAP: {imapHost}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {t('onboarding.summary.edit')}
                  </button>
                </div>

                {/* Karta: Synchronizacja */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('onboarding.summary.card_sync')}</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {autoSyncEnabled ? t('onboarding.summary.sync_push') : t('onboarding.summary.sync_manual')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {t('onboarding.summary.sync_fallback', { min: syncFrequencySec / 60, limit: syncMessageLimit })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {t('onboarding.summary.edit')}
                  </button>
                </div>

                {/* Karta: Powiadomienia */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('onboarding.summary.card_notifications')}</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {notifyNewMail ? t('onboarding.summary.notif_on', { sound: notifySound ? t('onboarding.summary.notif_sound_suffix') : '' }) : t('onboarding.summary.notif_off')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {notifyPreview ? t('onboarding.summary.notif_with_preview') : t('onboarding.summary.notif_without_preview')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {t('onboarding.summary.edit')}
                  </button>
                </div>

                {/* Karta: Wygląd */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('onboarding.summary.card_appearance')}</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {t('onboarding.summary.theme_label', { theme: theme === 'light' ? t('settings.theme.light') : theme === 'dark' ? t('settings.theme.dark') : t('settings.theme.system') })}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {t('onboarding.summary.default_view_line', {
                        view: defaultView === 'mail' ? t('onboarding.appearance.view_mail') : defaultView === 'calendar' ? t('onboarding.appearance.view_calendar') : t('onboarding.appearance.view_files'),
                        sort: sortOrder === 'date_desc' ? t('messageList.sort.date_desc') : t('onboarding.appearance.sort_unread_first')
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {t('onboarding.summary.edit')}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ← {t('common.back', undefined, 'Wstecz')}
                </button>
                <button
                  type="button"
                  onClick={handleFinishWizard}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.99] flex items-center gap-2"
                >
                  <span>{t('onboarding.summary.launch_btn', undefined, 'Zakończ konfigurację')}</span>
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
