import React, { useState, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import type { ComposeAttachment, PickedFile } from '@shared/ipc'
import { useAccountsStore } from '../state/accounts-store'
import { useTranslation } from '../i18n'

interface ComposerPaneProps {
  onClose: () => void
  initialTo?: string
  initialSubject?: string
  initialBodyHtml?: string
}

function parseAddrList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ATTACHMENT_HINT = /(w\s+za[łl]\.?|za[łl]ączam|za[łl]ączeni[ue]|w\s+za[łl]ączeniu|attached|please find attached)/i

export function ComposerPane({
  onClose,
  initialTo = '',
  initialSubject = '',
  initialBodyHtml = ''
}: ComposerPaneProps): JSX.Element {
  const { t } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const [accountId, setAccountId] = useState<string>('')
  const [toInput, setToInput] = useState('')
  const [toList, setToList] = useState<string[]>([])
  const [ccInput, setCcInput] = useState('')
  const [ccList, setCcList] = useState<string[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [bccInput, setBccInput] = useState('')
  const [bccList, setBccList] = useState<string[]>([])
  const [subject, setSubject] = useState(initialSubject)
  const [attachments, setAttachments] = useState<PickedFile[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmNoAttachment, setConfirmNoAttachment] = useState(false)
  const [followUpEnabled, setFollowUpEnabled] = useState(false)
  const [followUpHours] = useState(72)
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState(false)
  const [customScheduleOpen, setCustomScheduleOpen] = useState(false)
  const [customScheduleValue, setCustomScheduleValue] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline
    ],
    content: initialBodyHtml || t('composer.default_greeting')
  })

  // Initialize recipients and subject from prefill
  useEffect(() => {
    if (initialTo) {
      const parsed = parseAddrList(initialTo)
      setToList(parsed)
    }
    if (initialSubject) {
      setSubject(initialSubject)
    }
    if (initialBodyHtml && editor) {
      editor.commands.setContent(initialBodyHtml)
    }
  }, [initialTo, initialSubject, initialBodyHtml, editor])

  const effectiveAccountId = accountId || accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || ''
  const activeAccount = accounts.find((a) => a.id === effectiveAccountId) || accounts[0]

  async function handlePickAttachments(): Promise<void> {
    try {
      const picked = await window.mailapp?.files?.pickAttachment?.()
      if (picked) {
        setAttachments((prev) => [...prev, ...picked])
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function removeAttachment(index: number): void {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  function buildComposeAttachments(): ComposeAttachment[] {
    return attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      contentBase64: a.contentBase64
    }))
  }

  async function doSend(): Promise<void> {
    const finalTo = [...toList, ...parseAddrList(toInput)]
    const finalCc = [...ccList, ...parseAddrList(ccInput)]
    const finalBcc = [...bccList, ...parseAddrList(bccInput)]

    if (finalTo.length === 0) {
      setError(t('composer.error_no_recipient'))
      return
    }

    setSending(true)
    setError(null)
    try {
      await window.mailapp?.messages?.send?.({
        accountId: effectiveAccountId,
        to: finalTo,
        cc: finalCc,
        bcc: finalBcc,
        subject: subject.trim() || t('reader.no_subject'),
        bodyHtml: editor?.getHTML() ?? '',
        attachments: buildComposeAttachments(),
        followUpAfterHours: followUpEnabled ? followUpHours : undefined
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function doScheduleSend(sendAt: Date): Promise<void> {
    const finalTo = [...toList, ...parseAddrList(toInput)]
    const finalCc = [...ccList, ...parseAddrList(ccInput)]
    const finalBcc = [...bccList, ...parseAddrList(bccInput)]

    if (finalTo.length === 0) {
      setError(t('composer.error_no_recipient'))
      return
    }

    setSending(true)
    setError(null)
    setScheduleMenuOpen(false)
    try {
      await window.mailapp?.scheduled?.send?.({
        accountId: effectiveAccountId,
        to: finalTo,
        cc: finalCc,
        bcc: finalBcc,
        subject: subject.trim() || t('reader.no_subject'),
        bodyHtml: editor?.getHTML() ?? '',
        attachments: buildComposeAttachments(),
        followUpAfterHours: followUpEnabled ? followUpHours : undefined,
        sendAt: sendAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  function handleSendClick(): void {
    const plainText = editor?.getText() ?? ''
    if (!confirmNoAttachment && attachments.length === 0 && ATTACHMENT_HINT.test(plainText)) {
      setConfirmNoAttachment(true)
      return
    }
    doSend()
  }

  function scheduleAt(hoursFromNow: number): void {
    doScheduleSend(new Date(Date.now() + hoursFromNow * 3600_000))
  }

  function scheduleTomorrowAt(hour: number): void {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(hour, 0, 0, 0)
    doScheduleSend(d)
  }

  function scheduleNextMonday(): void {
    const d = new Date()
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7))
    d.setHours(9, 0, 0, 0)
    doScheduleSend(d)
  }

  function confirmCustomSchedule(): void {
    if (!customScheduleValue) return
    doScheduleSend(new Date(customScheduleValue))
    setCustomScheduleOpen(false)
  }

  // Keyboard shortcut Ctrl+Enter / ⌘+Enter to send
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSendClick()
      }
      if (e.key === 'Escape' && !scheduleMenuOpen && !accountDropdownOpen) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toList, toInput, subject, onClose, scheduleMenuOpen, accountDropdownOpen])

  // Recipient chip management
  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = toInput.trim()
      if (val && !toList.includes(val)) {
        setToList([...toList, val])
        setToInput('')
      }
    } else if (e.key === 'Backspace' && !toInput && toList.length > 0) {
      setToList(toList.slice(0, -1))
    }
  }

  const handleCcKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = ccInput.trim()
      if (val && !ccList.includes(val)) {
        setCcList([...ccList, val])
        setCcInput('')
      }
    } else if (e.key === 'Backspace' && !ccInput && ccList.length > 0) {
      setCcList(ccList.slice(0, -1))
    }
  }

  return (
    <div
      className={`flex-1 bg-surface dark:bg-[#0b0f19] flex flex-col overflow-hidden relative ${
        isFullScreen ? 'fixed inset-0 z-50' : 'h-full'
      }`}
      data-testid="composer-pane"
    >
      {/* 1. Header Bar: Title, Sender Account Selector, TLS Status, Window Buttons */}
      <div className="h-14 px-space-lg bg-surface-container-lowest dark:bg-[#121826] border-b border-border-subtle dark:border-white/[0.06] flex items-center justify-between shadow-sm z-10 select-none">
        <div className="flex items-center gap-space-md min-w-0">
          <div className="flex items-center gap-space-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-primary-container dark:bg-indigo-500 animate-pulse" />
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface dark:text-white tracking-tight">
              {t('composer.title')}
            </h1>
          </div>

          {/* Sender Account Picker */}
          <div className="relative group ml-space-sm">
            <button
              type="button"
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              className="flex items-center gap-space-xs bg-surface-container-low dark:bg-surface-elevated hover:bg-surface-container dark:hover:bg-slate-800 px-space-md py-1 rounded-xl transition-all border border-border-subtle dark:border-white/[0.06]"
            >
              <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">
                {t('composer.from')}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white truncate max-w-[140px]">
                {activeAccount?.displayName || 'Jan Kowalski'}
              </span>
              <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted hidden sm:inline">
                &lt;{activeAccount?.email || 'jan@mailapp.pl'}&gt;
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant dark:text-text-muted">
                expand_more
              </span>
            </button>

            {/* Dropdown Menu for accounts */}
            {accountDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-surface-container-lowest dark:bg-[#1a2333] border border-border-subtle dark:border-white/[0.08] rounded-xl shadow-xl p-1.5 z-40 text-left animate-in fade-in duration-100">
                <div className="px-space-sm py-1 font-caption text-caption text-on-surface-variant dark:text-text-muted uppercase tracking-wider font-semibold">
                  {t('composer.select_sender')}
                </div>
                {accounts.map((acc) => {
                  const isCur = acc.id === effectiveAccountId
                  return (
                    <div
                      key={acc.id}
                      onClick={() => {
                        setAccountId(acc.id)
                        setAccountDropdownOpen(false)
                      }}
                      className={`flex items-center justify-between p-space-sm rounded-lg cursor-pointer transition-colors ${
                        isCur
                          ? 'bg-surface-container dark:bg-indigo-950/60 text-on-surface dark:text-white'
                          : 'hover:bg-surface-container-low dark:hover:bg-slate-800 text-on-surface dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-space-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <div className="flex flex-col">
                          <span className="font-title-sm text-caption font-semibold">
                            {acc.displayName || acc.email}
                          </span>
                          <span className="font-label-mono text-[10px] text-on-surface-variant dark:text-text-muted">
                            {acc.email}
                          </span>
                        </div>
                      </div>
                      {isCur && (
                        <span className="material-symbols-outlined text-[16px] text-primary dark:text-indigo-400">
                          check
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Header Right: TLS badge + window actions */}
        <div className="flex items-center gap-1 text-on-surface-variant dark:text-text-muted">
          <div className="hidden sm:flex items-center gap-1 mr-space-sm bg-surface-container-low dark:bg-emerald-950/40 border border-transparent dark:border-emerald-500/20 px-2 py-0.5 rounded-full font-label-mono text-[11px] text-emerald-700 dark:text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('composer.tls_active')}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container-high dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
            title={t('composer.minimize')}
          >
            <span className="material-symbols-outlined text-[18px]">remove</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 rounded-lg hover:bg-surface-container-high dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
            title={isFullScreen ? t('composer.fullscreen_exit') : t('composer.fullscreen_enter')}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isFullScreen ? 'close_fullscreen' : 'open_in_full'}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-error-container hover:text-on-error-container dark:hover:bg-rose-950/60 dark:hover:text-rose-300 transition-colors"
            title={t('composer.close_save')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* 2. Recipient and Subject Fields */}
      <div className="bg-surface-container-lowest dark:bg-[#121826] px-space-lg py-space-sm space-y-2 border-b border-border-subtle dark:border-white/[0.06] shadow-sm select-none">
        {/* Do: (Recipients) */}
        <div className="flex items-center gap-space-md min-h-[36px]">
          <span className="w-12 font-title-sm text-body-sm font-semibold text-on-surface-variant dark:text-text-muted">
            {t('composer.to')}
          </span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5">
            {toList.map((addr) => (
              <div
                key={addr}
                className="inline-flex items-center gap-1.5 bg-surface-container-high dark:bg-[#1f293d] text-on-surface dark:text-white pl-2 pr-1.5 py-0.5 rounded-full shadow-sm text-caption"
              >
                <span className="font-title-sm font-semibold">{addr}</span>
                <button
                  type="button"
                  onClick={() => setToList(toList.filter((a) => a !== addr))}
                  className="hover:text-error dark:hover:text-rose-400 transition-colors flex items-center"
                >
                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                </button>
              </div>
            ))}
            <input
              type="text"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              onKeyDown={handleToKeyDown}
              className="flex-1 min-w-[160px] bg-transparent font-body-sm text-body-sm text-on-surface dark:text-white outline-none placeholder:text-on-surface-variant/50 dark:placeholder:text-text-muted"
              placeholder={toList.length === 0 ? t('composer.to_placeholder') : t('composer.to_placeholder_more')}
            />
          </div>
          <div className="flex items-center gap-1 text-caption font-label-mono">
            <button
              type="button"
              onClick={() => setShowCc(!showCc)}
              className={`px-2 py-0.5 rounded transition-colors ${
                showCc
                  ? 'bg-primary/10 text-primary dark:text-indigo-400 font-semibold'
                  : 'hover:bg-surface-container text-on-surface-variant dark:text-text-muted'
              }`}
            >
              {t('composer.cc_label', undefined, 'Cc')}
            </button>
            <button
              type="button"
              onClick={() => setShowBcc(!showBcc)}
              className={`px-2 py-0.5 rounded transition-colors ${
                showBcc
                  ? 'bg-primary/10 text-primary dark:text-indigo-400 font-semibold'
                  : 'hover:bg-surface-container text-on-surface-variant dark:text-text-muted'
              }`}
            >
              {t('composer.bcc_label', undefined, 'Bcc')}
            </button>
          </div>
        </div>

        {/* DW: (CC) */}
        {showCc && (
          <div className="flex items-center gap-space-md min-h-[32px]">
            <span className="w-12 font-title-sm text-body-sm font-semibold text-on-surface-variant dark:text-text-muted">
              {t('composer.cc')}
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {ccList.map((addr) => (
                <div
                  key={addr}
                  className="inline-flex items-center gap-1.5 bg-surface-container dark:bg-[#1f293d] text-on-surface dark:text-white pl-2 pr-1.5 py-0.5 rounded-full text-caption"
                >
                  <span className="material-symbols-outlined text-[14px] text-secondary">groups</span>
                  <span className="font-title-sm font-medium">{addr}</span>
                  <button
                    type="button"
                    onClick={() => setCcList(ccList.filter((a) => a !== addr))}
                    className="hover:text-error transition-colors flex items-center"
                  >
                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                  </button>
                </div>
              ))}
              <input
                type="text"
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={handleCcKeyDown}
                className="flex-1 min-w-[120px] bg-transparent font-body-sm text-body-sm text-on-surface dark:text-white outline-none placeholder:text-on-surface-variant/40 dark:placeholder:text-text-muted"
                placeholder={t('composer.cc_placeholder')}
              />
            </div>
          </div>
        )}

        {/* UDW: (BCC) */}
        {showBcc && (
          <div className="flex items-center gap-space-md min-h-[32px]">
            <span className="w-12 font-title-sm text-body-sm font-semibold text-on-surface-variant dark:text-text-muted">
              {t('composer.bcc')}
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {bccList.map((addr) => (
                <div
                  key={addr}
                  className="inline-flex items-center gap-1.5 bg-surface-container dark:bg-[#1f293d] text-on-surface dark:text-white pl-2 pr-1.5 py-0.5 rounded-full text-caption"
                >
                  <span className="font-title-sm font-medium">{addr}</span>
                  <button
                    type="button"
                    onClick={() => setBccList(bccList.filter((a) => a !== addr))}
                    className="hover:text-error transition-colors flex items-center"
                  >
                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                  </button>
                </div>
              ))}
              <input
                type="text"
                value={bccInput}
                onChange={(e) => setBccInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    const val = bccInput.trim()
                    if (val && !bccList.includes(val)) {
                      setBccList([...bccList, val])
                      setBccInput('')
                    }
                  }
                }}
                className="flex-1 min-w-[120px] bg-transparent font-body-sm text-body-sm text-on-surface dark:text-white outline-none placeholder:text-on-surface-variant/40 dark:placeholder:text-text-muted"
                placeholder={t('composer.bcc_placeholder')}
              />
            </div>
          </div>
        )}

        {/* Temat: (Subject) */}
        <div className="flex items-center gap-space-md min-h-[36px]">
          <span className="w-12 font-title-sm text-body-sm font-semibold text-on-surface-variant dark:text-text-muted">
            {t('composer.subject')}:
          </span>
          <div className="flex-1 flex items-center gap-space-sm">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-transparent font-title-sm text-headline-md font-bold text-on-surface dark:text-white outline-none focus:text-primary dark:focus:text-indigo-400 transition-colors"
              placeholder={t('composer.subject_placeholder')}
            />
            <span className="font-label-mono text-[10px] bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
              #AURA-MAIL
            </span>
          </div>
        </div>
      </div>

      {/* 3. Rich Text Editor Toolbar */}
      <div className="px-space-lg py-1.5 bg-surface-container-low dark:bg-[#161f30] border-b border-border-subtle dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-1 shadow-sm select-none">
        <div className="flex items-center flex-wrap gap-0.5">
          {/* Krój pisma i rozmiar */}
          <div className="flex items-center bg-surface-container-lowest dark:bg-[#121826] rounded-lg px-2 py-1 mr-1 gap-1 text-caption font-title-sm font-medium text-on-surface dark:text-slate-200 border border-border-subtle dark:border-white/[0.04]">
            <span>{t('composer.font_family')}</span>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant dark:text-text-muted">
              arrow_drop_down
            </span>
          </div>
          <div className="flex items-center bg-surface-container-lowest dark:bg-[#121826] rounded-lg px-2 py-1 mr-2 gap-1 text-caption font-label-mono text-on-surface dark:text-slate-200 border border-border-subtle dark:border-white/[0.04]">
            <span>13px</span>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant dark:text-text-muted">
              arrow_drop_down
            </span>
          </div>

          {/* Formatowanie */}
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('bold')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300 font-bold'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.bold')}
          >
            <span className="material-symbols-outlined text-[16px]">format_bold</span>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('italic')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.italic')}
          >
            <span className="material-symbols-outlined text-[16px]">format_italic</span>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('underline')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.underline')}
          >
            <span className="material-symbols-outlined text-[16px]">format_underlined</span>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('strike')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.strike')}
          >
            <span className="material-symbols-outlined text-[16px]">strikethrough_s</span>
          </button>

          <span className="w-px h-4 bg-outline-variant/50 dark:bg-white/10 mx-1" />

          {/* Listy */}
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('bulletList')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.bullet_list')}
          >
            <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('orderedList')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.ordered_list')}
          >
            <span className="material-symbols-outlined text-[16px]">format_list_numbered</span>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor?.isActive('codeBlock')
                ? 'bg-surface-container-highest dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
            }`}
            title={t('composer.toolbar.code_block')}
          >
            <span className="material-symbols-outlined text-[16px]">code</span>
          </button>
        </div>

        {/* AI Assistant Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              editor?.commands.insertContent(t('composer.ai_mock_text'))
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-primary-fixed to-surface-variant dark:from-indigo-900/60 dark:to-indigo-800/40 text-on-primary-fixed-variant dark:text-indigo-200 hover:shadow-sm transition-all font-title-sm text-caption font-semibold"
            title={t('composer.ai_tooltip')}
          >
            <span className="material-symbols-outlined text-[16px] text-primary dark:text-indigo-400">
              auto_awesome
            </span>
            <span>{t('composer.ai_button')}</span>
            <span className="font-label-mono text-[9px] bg-primary/20 text-primary dark:text-indigo-300 px-1 rounded">
              ⌘J
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Banner if user mentions attachment but none is attached */}
      {confirmNoAttachment && (
        <div className="px-space-lg py-2 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800/40 flex items-center justify-between gap-2 text-amber-900 dark:text-amber-200 text-caption font-body-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
            <span>{t('composer.mention_warning.desc')}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handlePickAttachments}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-semibold text-caption hover:bg-amber-100 transition-colors"
            >
              {t('composer.attach')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmNoAttachment(false)
                doSend()
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold text-caption hover:bg-amber-700 transition-colors"
            >
              {t('composer.mention_warning.send_anyway')}
            </button>
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="px-space-lg py-2 bg-error-container text-on-error-container text-caption flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="p-0.5">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* 4. Main Body Editor Canvas */}
      <div className="flex-1 overflow-y-auto px-space-xl py-space-lg bg-surface-container-lowest dark:bg-[#0f1522] flex flex-col justify-between">
        <div className="max-w-3xl space-y-4 w-full">
          <div className="font-body-lg text-body-lg text-on-surface dark:text-slate-100 leading-relaxed outline-none min-h-[160px] prose dark:prose-invert max-w-none">
            <EditorContent editor={editor} />
          </div>

          {/* Professional Sender Signature Strip */}
          <div className="pt-space-md mt-6 select-none bg-surface-container-low/60 dark:bg-slate-800/40 p-space-md rounded-xl max-w-xl border border-border-subtle dark:border-white/[0.04]">
            <div className="flex items-center gap-space-md">
              <div className="w-12 h-12 rounded-xl bg-primary-container dark:bg-indigo-600 text-white font-bold flex items-center justify-center text-title-sm shadow-sm flex-shrink-0">
                {(activeAccount?.displayName || activeAccount?.email || 'AM').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-headline-md text-title-sm font-bold text-on-surface dark:text-white">
                    {activeAccount?.displayName || 'Alex Morgan'}
                  </span>
                  <span className="text-[11px] font-label-mono px-1.5 py-0.2 rounded bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 font-semibold">
                    {t('composer.signature.role', undefined, 'LEAD ARCHITECT')}
                  </span>
                </div>
                <span className="font-body-sm text-caption text-on-surface-variant dark:text-text-muted">
                  {t('composer.signature.team', undefined, 'AuraMail Core Platform • Infrastructure & Reliability')}
                </span>
                <div className="flex items-center gap-space-md mt-1 text-caption text-on-surface-variant dark:text-text-muted font-label-mono">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-primary dark:text-indigo-400">
                      call
                    </span>
                    +48 22 590 12 00
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-secondary">domain</span>
                    {activeAccount?.email?.split('@')[1] || 'auramail.io'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Attachments Section */}
        <div className="mt-8 pt-space-md space-y-space-sm border-t border-border-subtle dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-semibold">
              {t('composer.attachments_title', {
                count: attachments.length,
                label: attachments.length === 1 ? t('composer.attachment_unit_one') : t('composer.attachment_unit_many'),
                size: formatBytes(attachments.reduce((sum, a) => sum + (a.sizeBytes || 0), 0))
              })}
            </span>
            <span className="font-label-mono text-caption text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              {t('composer.attachments_scanned')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="group relative flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-low dark:bg-slate-800/60 hover:bg-surface-container dark:hover:bg-slate-800 transition-all shadow-sm border border-border-subtle dark:border-white/[0.04]"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[24px]">description</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white truncate">
                    {file.filename}
                  </div>
                  <div className="flex items-center gap-2 font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                    <span>{formatBytes(file.sizeBytes || 0)}</span>
                    <span>•</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">{t('composer.attachment_ready')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="p-1 rounded hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
                    title={t('composer.remove_attachment')}
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>
            ))}

            {/* Drag & Drop Add Attachment Box */}
            <div
              onClick={handlePickAttachments}
              className="flex items-center justify-center gap-space-sm p-space-sm rounded-xl bg-surface-container/50 dark:bg-slate-800/30 hover:bg-surface-container dark:hover:bg-slate-800/60 border-2 border-dashed border-outline-variant/60 dark:border-white/10 cursor-pointer transition-all"
            >
              <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px]">
                cloud_upload
              </span>
              <span className="font-title-sm text-caption font-semibold text-on-surface-variant dark:text-text-muted">
                {t('composer.drag_drop_hint')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Footer Action Bar: Split Send Button, Schedule Dropdown, Tools, Discard */}
      <div className="h-16 px-space-lg bg-surface-container-lowest dark:bg-[#121826] border-t border-border-subtle dark:border-white/[0.06] flex items-center justify-between shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-20 select-none">
        {/* Left: Split Send & Utilities */}
        <div className="flex items-center gap-space-md">
          {/* Grouped Send Button with Schedule Split */}
          <div className="relative inline-flex rounded-xl shadow-md bg-primary-container">
            <button
              type="button"
              onClick={handleSendClick}
              disabled={sending}
              className="flex items-center gap-space-sm bg-primary-container dark:bg-indigo-600 text-white px-space-lg py-2 hover:bg-primary dark:hover:bg-indigo-500 transition-colors font-title-sm text-title-sm font-semibold rounded-l-xl disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">
                {sending ? 'hourglass_top' : 'send'}
              </span>
              <span>{sending ? t('composer.sending') : t('composer.send')}</span>
              <span className="ml-1 font-label-mono text-caption opacity-75 bg-primary/30 px-1.5 py-0.5 rounded">
                ⌘↵
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScheduleMenuOpen(!scheduleMenuOpen)}
              className="px-2 bg-primary dark:bg-indigo-700 hover:bg-tertiary dark:hover:bg-indigo-800 text-white transition-colors flex items-center justify-center rounded-r-xl border-l border-primary-fixed/20"
              title={t('composer.schedule_send_tooltip')}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_drop_up</span>
            </button>

            {/* Dropdown Popup: Schedule Send */}
            {scheduleMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-container-lowest dark:bg-[#1a2333] rounded-xl shadow-xl border border-outline-variant/60 dark:border-white/[0.08] p-2 z-50 text-left select-none animate-in fade-in duration-100">
                <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                  <div className="flex items-center gap-1.5 text-on-surface dark:text-white font-title-sm text-body-sm font-semibold">
                    <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[18px]">
                      schedule_send
                    </span>
                    <span>{t('composer.schedule_send')}</span>
                  </div>
                  <span className="text-[10px] font-label-mono text-on-surface-variant dark:text-text-muted bg-surface-container dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    Alt+S
                  </span>
                </div>

                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => scheduleAt(3)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800 text-on-surface dark:text-slate-200 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-[18px]">
                        wb_twilight
                      </span>
                      <span className="font-body-sm text-body-sm font-medium">{t('composer.schedule.today_afternoon')}</span>
                    </div>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted group-hover:text-on-surface">
                      {t('composer.schedule.today_afternoon_desc')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => scheduleTomorrowAt(8)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800 text-on-surface dark:text-slate-200 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-[18px]">
                        wb_sunny
                      </span>
                      <span className="font-body-sm text-body-sm font-medium">{t('composer.schedule.tomorrow_morning_title')}</span>
                    </div>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted group-hover:text-on-surface">
                      08:00
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={scheduleNextMonday}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800 text-on-surface dark:text-slate-200 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-[18px]">
                        next_plan
                      </span>
                      <span className="font-body-sm text-body-sm font-medium">{t('composer.schedule.monday_title')}</span>
                    </div>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted group-hover:text-on-surface">
                      09:00
                    </span>
                  </button>
                </div>

                <div className="h-px bg-outline-variant/50 dark:bg-white/10 my-1.5" />

                {customScheduleOpen ? (
                  <div className="p-2 space-y-2">
                    <input
                      type="datetime-local"
                      value={customScheduleValue}
                      onChange={(e) => setCustomScheduleValue(e.target.value)}
                      className="w-full text-xs p-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-surface-container dark:bg-slate-900 text-on-surface dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={confirmCustomSchedule}
                      className="w-full py-1 text-xs bg-primary text-white rounded-lg font-semibold"
                    >
                      {t('composer.schedule.custom_btn')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCustomScheduleOpen(true)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800 text-on-surface dark:text-slate-200 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        calendar_month
                      </span>
                      <span className="font-title-sm text-body-sm font-semibold text-primary dark:text-indigo-400">
                        {t('composer.schedule.custom_pick')}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary">
                      chevron_right
                    </span>
                  </button>
                )}

                <div className="mt-1 pt-1.5 border-t border-outline-variant/40 dark:border-white/10 px-2 flex items-center justify-between text-[10px] font-label-mono text-on-surface-variant dark:text-text-muted">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">public</span>
                    <span>{t('composer.timezone_city')}</span>
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">{t('composer.timezone_active')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Additional Tool Buttons */}
          <div className="flex items-center gap-1 text-on-surface-variant dark:text-text-muted">
            <button
              type="button"
              onClick={handlePickAttachments}
              className="p-2 rounded-xl hover:bg-surface-container dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
              title={t('composer.attach_from_disk')}
            >
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor?.commands.insertContent(t('composer.template_meeting'))
              }}
              className="p-2 rounded-xl hover:bg-surface-container dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
              title={t('composer.insert_template')}
            >
              <span className="material-symbols-outlined text-[20px]">text_snippet</span>
            </button>
            <button
              type="button"
              onClick={() => setFollowUpEnabled(!followUpEnabled)}
              className={`p-2 rounded-xl transition-colors ${
                followUpEnabled
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  : 'hover:bg-surface-container dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white'
              }`}
              title={t('composer.followup_tooltip')}
            >
              <span className="material-symbols-outlined text-[20px]">flag</span>
            </button>
            <button
              type="button"
              className="p-2 rounded-xl hover:bg-surface-container dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 transition-colors"
              title={t('composer.tls_secure')}
            >
              <span className="material-symbols-outlined text-[20px]">lock</span>
            </button>
          </div>
        </div>

        {/* Right: Draft Status & Discard */}
        <div className="flex items-center gap-space-lg">
          <div className="hidden sm:flex items-center gap-space-xs text-caption font-label-mono text-on-surface-variant dark:text-text-muted">
            <span className="material-symbols-outlined text-[15px] text-emerald-600 dark:text-emerald-400">
              check_circle
            </span>
            <span>{t('composer.draft_saved')}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-error-container hover:text-on-error-container text-on-surface-variant dark:text-text-muted transition-colors"
              title={t('composer.discard_tooltip')}
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
