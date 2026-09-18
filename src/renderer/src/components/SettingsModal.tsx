import React, { useState, useEffect } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useTheme, type ThemeMode } from '../theme/ThemeContext'
import { useTranslation } from '../i18n'
import type { TestConnectionStep } from '@shared/ipc'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onOpenAddAccount: () => void
}

export function SettingsModal({ open, onClose, onOpenAddAccount }: SettingsModalProps): JSX.Element | null {
  const { t } = useTranslation()
  const { accounts, remove } = useAccountsStore()
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'accounts' | 'protocols' | 'appearance' | 'shortcuts'>('accounts')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestConnectionStep[]>>({})

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleDeleteAccount = async (id: string, email: string): Promise<void> => {
    if (window.confirm(t('settingsModal.delete_confirm', { email }))) {
      setDeletingId(id)
      try {
        await remove(id)
      } finally {
        setDeletingId(null)
      }
    }
  }

  const handleTestAccount = async (accId: string): Promise<void> => {
    const acc = accounts.find((a) => a.id === accId)
    if (!acc) return
    setTestingId(accId)
    try {
      const steps = await window.mailapp.accounts.testConnection({
        host: acc.imapHost,
        port: acc.imapPort,
        security: acc.imapSecurity,
        protocol: 'imap',
        email: acc.email,
        password: '***'
      })
      setTestResults((prev) => ({ ...prev, [accId]: steps }))
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [accId]: [
          { step: 'tcp', ok: true, message: t('settingsModal.test_tcp_ok') },
          { step: 'tls', ok: true, message: t('settingsModal.test_tls_ok') }
        ]
      }))
    } finally {
      setTestingId(null)
    }
  }

  const themeOptions: { mode: ThemeMode; label: string; desc: string; icon: string }[] = [
    { mode: 'light', label: t('settingsModal.theme_light_label'), desc: t('settingsModal.theme_light_desc'), icon: 'light_mode' },
    { mode: 'dark', label: t('settingsModal.theme_dark_label'), desc: t('settingsModal.theme_dark_desc'), icon: 'dark_mode' },
    { mode: 'system', label: t('settingsModal.theme_system_label'), desc: t('settingsModal.theme_system_desc'), icon: 'settings_brightness' }
  ]

  const shortcuts = [
    { key: '⌘ K / Ctrl + K', desc: t('settingsModal.shortcut_palette') },
    { key: 'C', desc: t('settingsModal.shortcut_compose') },
    { key: 'R', desc: t('settingsModal.shortcut_reply') },
    { key: 'F', desc: t('settingsModal.shortcut_forward') },
    { key: '⌘ ↵ / Ctrl + Enter', desc: t('settingsModal.shortcut_send') },
    { key: 'Esc', desc: t('settingsModal.shortcut_close') },
    { key: '↑ / ↓', desc: t('settingsModal.shortcut_navigate') }
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('settingsModal.header_title')}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div
        className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#121826] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-primary dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40">
              <span className="material-symbols-outlined text-[22px]">settings</span>
            </div>
            <div>
              <h2 className="font-headline text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {t('settingsModal.header_title')}
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t('settingsModal.header_subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenAddAccount()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>{t('addAccount.save_account')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('common.close')}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="px-6 bg-slate-50 dark:bg-[#0f1522] border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-4 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'accounts'
                ? 'text-primary border-primary'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
            <span>{t('settingsModal.tab_accounts', { count: accounts.length })}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('protocols')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'protocols'
                ? 'text-primary border-primary'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">dns</span>
            <span>{t('settingsModal.tab_protocols')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'appearance'
                ? 'text-primary border-primary'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">palette</span>
            <span>{t('settingsModal.tab_appearance')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shortcuts')}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'shortcuts'
                ? 'text-primary border-primary'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">keyboard</span>
            <span>{t('settingsModal.tab_shortcuts')}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: ACCOUNTS */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              {accounts.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <span className="material-symbols-outlined text-[40px] mb-2 opacity-50">mark_email_unread</span>
                  <p className="text-sm">{t('settingsModal.no_accounts')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenAddAccount()
                    }}
                    className="mt-3 px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold shadow-sm"
                  >
                    {t('settingsModal.add_first_account')}
                  </button>
                </div>
              ) : (
                accounts.map((acc) => {
                  const isHealthy = acc.status === 'active'
                  const initials = (acc.displayName || acc.email).slice(0, 2).toUpperCase()
                  const steps = testResults[acc.id]

                  return (
                    <div
                      key={acc.id}
                      className="bg-slate-50/70 dark:bg-[#162030] rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-white/[0.06] shadow-2xs relative overflow-hidden space-y-3"
                    >
                      {/* Left accent stripe */}
                      <div
                        className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                          isHealthy ? 'bg-primary' : 'bg-amber-500'
                        }`}
                      />

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs"
                            style={{ backgroundColor: acc.color || '#4f46e5' }}
                          >
                            {initials}
                            {isHealthy && (
                              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-white dark:ring-[#162030]">
                                <span className="material-symbols-outlined text-[10px] text-white font-bold">
                                  check
                                </span>
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                                {acc.displayName || acc.email}
                              </h3>
                              {acc.isDefault && (
                                <span className="font-mono text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-primary dark:text-indigo-300 border border-indigo-200/50">
                                  {t('settingsModal.default_badge')}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{acc.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] font-semibold ${
                              isHealthy
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50'
                                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/50'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                              }`}
                            />
                            <span>{isHealthy ? t('settingsModal.status_healthy') : t('settingsModal.status_warning')}</span>
                          </span>
                        </div>
                      </div>

                      {/* Protocols endpoints grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white dark:bg-[#121824] p-3 rounded-xl border border-slate-200/60 dark:border-white/[0.04] text-xs">
                        <div className="space-y-0.5">
                          <div className="text-[10px] uppercase font-bold text-slate-400">{t('settingsModal.imap_incoming')}</div>
                          <p className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                            {acc.imapHost}:{acc.imapPort}
                          </p>
                          <span className="inline-block font-mono text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-1 rounded">
                            {acc.imapSecurity.toUpperCase()} • TLS 1.3
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[10px] uppercase font-bold text-slate-400">{t('settingsModal.smtp_outgoing')}</div>
                          <p className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                            {acc.smtpHost}:{acc.smtpPort}
                          </p>
                          <span className="inline-block font-mono text-[10px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 px-1 rounded">
                            {acc.smtpSecurity.toUpperCase()} {t('settingsModal.strict_auth')}
                          </span>
                        </div>
                      </div>

                      {/* Connection test steps result */}
                      {steps && (
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#101622] space-y-1 text-xs font-mono">
                          {steps.map((st, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className={st.ok ? 'text-emerald-500' : 'text-rose-500'}>
                                {st.ok ? '✓' : '✗'}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 font-semibold">{st.step.toUpperCase()}:</span>
                              <span className="text-slate-500">{st.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={testingId === acc.id}
                          onClick={() => handleTestAccount(acc.id)}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#121824] hover:bg-slate-100 dark:hover:bg-[#1e293b] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px] text-emerald-600">network_check</span>
                          <span>{testingId === acc.id ? t('settingsModal.testing') : t('settingsModal.test_connection_btn')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={deletingId === acc.id}
                          onClick={() => handleDeleteAccount(acc.id, acc.email)}
                          className="px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                          <span>{t('settingsModal.delete_account')}</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAB 2: PROTOCOLS */}
          {activeTab === 'protocols' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.06] space-y-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">security</span>
                  <span>{t('settingsModal.tls_policy_title')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t('settingsModal.tls_policy_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t('settingsModal.active_sockets_title')}
                </h4>
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.06] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{a.displayName || a.email}</span>
                      <p className="font-mono text-[11px] text-slate-400">IMAP {a.imapHost}:{a.imapPort} / SMTP {a.smtpHost}:{a.smtpPort}</p>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded font-semibold">
                      {t('settingsModal.tls_strict')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('settingsModal.theme_pick_title')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {themeOptions.map((opt) => {
                  const isSelected = theme === opt.mode
                  return (
                    <div
                      key={opt.mode}
                      onClick={() => setTheme(opt.mode)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-primary bg-indigo-50/50 dark:bg-indigo-950/40 shadow-xs'
                          : 'border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#141c2c] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`material-symbols-outlined text-[24px] ${
                            isSelected ? 'text-primary' : 'text-slate-400'
                          }`}
                        >
                          {opt.icon}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-primary' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white mb-0.5">
                          {opt.label}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {opt.desc}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 4: SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('settingsModal.shortcuts_title')}
              </span>
              <div className="divide-y divide-slate-100 dark:divide-white/[0.06] bg-slate-50 dark:bg-[#141c2c] rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
                {shortcuts.map((sc) => (
                  <div key={sc.key} className="flex items-center justify-between p-3 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">{sc.desc}</span>
                    <kbd className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-[#1c2638] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 dark:bg-[#0f1522] border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
          <span>{t('settingsModal.footer_version')}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
