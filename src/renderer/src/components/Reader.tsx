import React, { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { useMailStore } from '../state/mail-store'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation } from '../i18n'
import { useTheme } from '../theme/ThemeContext'
import { EmptyState } from './ui/EmptyState'
import { Skeleton } from './ui/Skeleton'

interface ReaderProps {
  onReply?: (to: string, subject: string) => void
  onForward?: (subject: string, bodyHtml: string) => void
  onBack?: () => void
  isMobile?: boolean
  onToggleDossier?: () => void
  isDossierOpen?: boolean
  onOpenThreadDossier?: () => void
}

// Regex dopasowujący url(...) wskazujące na zdalne zasoby http(s) wewnątrz CSS —
// używany do blokowania zdalnych obrazów tła zarówno w atrybutach style="", jak
// i w blokach <style>, zanim ich treść trafi do sandboxowanego iframe'a.
const REMOTE_CSS_URL = /url\(\s*(['"]?)(https?:\/\/[^'")]+)\1\s*\)/gi

function stripRemoteCssUrls(css: string): string {
  return css.replace(REMOTE_CSS_URL, 'none').replace(/@import\s+(url\()?['"]?https?:\/\/[^;]+;?/gi, '')
}

function sanitizeHtml(html: string, allowRemoteImages: boolean): string {
  const clean = DOMPurify.sanitize(html, {
    // 'style' NIE jest tu zabraniany — e-maile HTML niemal zawsze stylują się przez
    // inline style="" oraz bloki <style> (media queries, @font-face, dark-mode). Blokowanie
    // ich psuło kolory/czcionki niemal każdej realnej wiadomości. 'link' zostaje zabroniony,
    // żeby nie dało się dociągnąć zdalnego arkusza stylów (odpowiednik trackera obrazkowego).
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick']
  })

  const container = document.createElement('div')
  container.innerHTML = clean

  if (!allowRemoteImages) {
    container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? ''
      if (!src.startsWith('data:')) {
        img.setAttribute('data-blocked-src', src)
        img.removeAttribute('src')
      }
    })
    container.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const style = el.getAttribute('style')
      if (style && REMOTE_CSS_URL.test(style)) {
        REMOTE_CSS_URL.lastIndex = 0
        el.setAttribute('style', stripRemoteCssUrls(style))
      }
      REMOTE_CSS_URL.lastIndex = 0
    })
    container.querySelectorAll('style').forEach((styleTag) => {
      styleTag.textContent = stripRemoteCssUrls(styleTag.textContent ?? '')
    })
  }

  return container.innerHTML
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function Reader({
  onReply,
  onForward,
  onBack,
  isMobile,
  onToggleDossier,
  isDossierOpen,
  onOpenThreadDossier
}: ReaderProps): JSX.Element {
  const { selectedMessageId, selectedMessageDetail, selectFolder, selectedFolderId, folders, setMessageFlags } = useMailStore()
  const { labels, toggleMessageLabel } = useLabelsStore()
  const { t, formatDate } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)
  const [quickReplyText, setQuickReplyText] = useState('')
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false)
  const [labelsMenuOpen, setLabelsMenuOpen] = useState(false)
  const labelsMenuRef = useRef<HTMLDivElement>(null)
  const autoMarkedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (labelsMenuRef.current && !labelsMenuRef.current.contains(e.target as Node)) {
        setLabelsMenuOpen(false)
      }
    }
    if (labelsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [labelsMenuOpen])

  // Automatyczne oznaczanie wiadomości jako przeczytana po jej rzeczywistym
  // załadowaniu i wyświetleniu użytkownikowi w czytniku.
  // Bufor 350ms chroni przed przypadkowym lub zbyt szybkim przeklikiwaniem listy.
  useEffect(() => {
    if (!selectedMessageDetail || selectedMessageDetail.isRead) return
    const msgId = selectedMessageDetail.id
    if (autoMarkedIdsRef.current.has(msgId)) return

    const timer = setTimeout(() => {
      const current = useMailStore.getState().selectedMessageDetail
      if (current && current.id === msgId && !current.isRead) {
        autoMarkedIdsRef.current.add(msgId)
        setMessageFlags(msgId, { isRead: true })
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [selectedMessageDetail?.id, setMessageFlags])

  const isDark = resolvedTheme === 'dark'

  const currentFolder = folders.find((f) => f.id === selectedFolderId)

  const srcDoc = useMemo(() => {
    if (!selectedMessageDetail) return ''
    const bodyContent = selectedMessageDetail.bodyHtml
      ? sanitizeHtml(selectedMessageDetail.bodyHtml, allowRemoteImages)
      : `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6">${escapeHtml(
          selectedMessageDetail.bodyPlain ?? ''
        )}</pre>`

    const themeStyles = isDark
      ? `body { background-color: #0f1522; color: #f1f5f9; } a { color: #818cf8; } blockquote { border-left: 3px solid #334155; padding-left: 12px; color: #94a3b8; } hr { border: none; border-top: 1px solid #1e293b; }`
      : `body { background-color: #ffffff; color: #0f172a; } a { color: #4f46e5; } blockquote { border-left: 3px solid #e2e8f0; padding-left: 12px; color: #64748b; } hr { border: none; border-top: 1px solid #f1f5f9; }`

    // Uwaga: brak <link> do Google Fonts — CSP aplikacji ('style-src self') i tak blokuje
    // ten request w buildzie produkcyjnym (działał tylko w dev), więc czcionka faktycznie
    // ładowana w prod różniła się od tej w dev. Zamiast tego opieramy się wyłącznie na
    // fontach systemowych, identycznie w dev i w prod.
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.65;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    body {
      margin: 24px;
    }
    ${themeStyles}
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    pre, code { font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, monospace; }
    pre { overflow-x: auto; white-space: pre-wrap; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`
  }, [selectedMessageDetail, allowRemoteImages, isDark])

  const handlePrint = (): void => {
    window.print()
  }

  const handleSnooze = async (hours: number): Promise<void> => {
    if (!selectedMessageId) return
    const until = new Date(Date.now() + hours * 3600_000).toISOString()
    await window.mailapp.messages.snooze(selectedMessageId, until)
    if (selectedFolderId) await selectFolder(selectedFolderId)
  }

  const handleQuickSend = async (): Promise<void> => {
    if (!quickReplyText.trim() || !selectedMessageDetail) return
    setIsSendingQuickReply(true)
    try {
      if (onReply) {
        onReply(selectedMessageDetail.fromAddr, `Re: ${selectedMessageDetail.subject}`)
      }
      setQuickReplyText('')
    } finally {
      setIsSendingQuickReply(false)
    }
  }

  if (!selectedMessageId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50/50 dark:bg-[#0f1522] h-full">
        <EmptyState
          icon={<span className="material-symbols-outlined text-[36px]">mark_email_read</span>}
          title={t('reader.select_prompt_title')}
          description={t('reader.select_prompt')}
        />
      </div>
    )
  }

  if (!selectedMessageDetail) {
    return (
      <div className="p-8 flex flex-col gap-4 bg-white dark:bg-[#121826] h-full">
        <Skeleton variant="title" width="60%" height={28} />
        <div className="flex gap-3 items-center">
          <Skeleton variant="avatar" width={42} height={42} />
          <div className="flex-1 space-y-2">
            <Skeleton width="30%" height={14} />
            <Skeleton width="20%" height={12} />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton width="100%" height={14} />
          <Skeleton width="95%" height={14} />
          <Skeleton width="90%" height={14} />
          <Skeleton width="75%" height={14} />
        </div>
      </div>
    )
  }

  const hasRemoteImages = Boolean(selectedMessageDetail.bodyHtml?.includes('<img'))
  const senderDisplayName = selectedMessageDetail.fromName || selectedMessageDetail.fromAddr
  const recipientTo = selectedMessageDetail.toJson ? JSON.parse(selectedMessageDetail.toJson) : []
  const initials = senderDisplayName ? senderDisplayName.slice(0, 2).toUpperCase() : 'OD'

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0f1522] overflow-hidden">
      {/* Sticky Thread Action Toolbar */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-[#121826]/95 backdrop-blur-md px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isMobile && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors mr-1"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>{t('reader.back_to_list')}</span>
            </button>
          )}

          {/* Quick Reply & Forward */}
          <button
            type="button"
            onClick={() => onReply?.(selectedMessageDetail.fromAddr, `Re: ${selectedMessageDetail.subject}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-primary dark:text-indigo-300 font-semibold text-xs transition-colors shadow-2xs border border-indigo-100 dark:border-indigo-900/40"
            title={`${t('reader.reply')} (R)`}
          >
            <span className="material-symbols-outlined text-[16px]">reply</span>
            <span>{t('reader.reply')}</span>
            <kbd className="hidden sm:inline font-mono text-[9px] opacity-70 bg-white/80 dark:bg-indigo-900/80 px-1 rounded">
              R
            </kbd>
          </button>

          <button
            type="button"
            onClick={() =>
              onForward?.(
                `Fwd: ${selectedMessageDetail.subject}`,
                selectedMessageDetail.bodyHtml || selectedMessageDetail.bodyPlain || ''
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors"
            title={`${t('reader.forward')} (F)`}
          >
            <span className="material-symbols-outlined text-[16px]">forward</span>
            <span>{t('reader.forward')}</span>
            <kbd className="hidden sm:inline font-mono text-[9px] opacity-70 bg-white/80 dark:bg-slate-900 px-1 rounded">
              F
            </kbd>
          </button>

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* Archive / Delete / Snooze / Print */}
          <button
            type="button"
            onClick={() => handleSnooze(24)}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title={t('reader.snooze_24h')}
          >
            <span className="material-symbols-outlined text-[18px]">schedule</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title={t('reader.print')}
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
          </button>

          <button
            type="button"
            onClick={() => setLabelsMenuOpen((v) => !v)}
            className={`p-1.5 rounded-xl transition-colors ${
              labelsMenuOpen
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={t('reader.add_label')}
          >
            <span className="material-symbols-outlined text-[18px]">label</span>
          </button>
        </div>

        {/* Right side: Contact Dossier & Dedicated Thread View Buttons */}
        <div className="flex items-center gap-2">
          {onOpenThreadDossier && (
            <button
              type="button"
              onClick={onOpenThreadDossier}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container dark:bg-slate-800 hover:bg-surface-container-high text-primary dark:text-indigo-400 text-xs font-semibold transition-all border border-border-subtle dark:border-white/[0.04]"
              title={t('reader.view_thread_tooltip')}
            >
              <span className="material-symbols-outlined text-[16px]">forum</span>
              <span className="hidden sm:inline">{t('reader.view_thread')}</span>
            </button>
          )}

          {onToggleDossier && (
            <button
              type="button"
              onClick={onToggleDossier}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isDossierOpen
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title={t('reader.contact_card_tooltip')}
            >
              <span className="material-symbols-outlined text-[16px]">contact_page</span>
              <span className="hidden sm:inline">{t('reader.contact_card')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Info Card */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/50 dark:bg-[#121826]/60 flex flex-col gap-3">
        {/* Subject & Priority Badges */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h1 className="font-headline text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
                {selectedMessageDetail.subject || t('reader.no_subject')}
              </h1>

              {selectedMessageDetail.isImportant && (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200/50 dark:border-rose-900/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  {t('reader.priority')}
                </span>
              )}
            </div>

            {/* Labels Chip Bar */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(selectedMessageDetail.labels || []).map((lbl) => (
                <span
                  key={lbl.id}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs group"
                  style={{
                    borderColor: lbl.color + '60',
                    backgroundColor: lbl.color + '15',
                    color: lbl.color
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lbl.color }} />
                  <span>{lbl.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleMessageLabel(selectedMessageDetail.id, lbl)}
                    className="hover:opacity-100 opacity-60 ml-0.5 transition-opacity"
                    title={t('reader.remove_label', { name: lbl.name })}
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                </span>
              ))}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLabelsMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium px-2 py-0.5 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.15] hover:border-indigo-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  <span>{t('reader.labels')}</span>
                </button>

                {labelsMenuOpen && (
                  <div
                    ref={labelsMenuRef}
                    className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-[#161f30] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1">
                      {t('labels.assign_title')}
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {labels.length === 0 ? (
                        <div className="text-xs text-slate-400 p-2 text-center">{t('reader.no_labels')}</div>
                      ) : (
                        labels.map((lbl) => {
                          const isAssigned = (selectedMessageDetail.labels || []).some((l) => l.id === lbl.id)
                          return (
                            <button
                              key={lbl.id}
                              type="button"
                              onClick={() => toggleMessageLabel(selectedMessageDetail.id, lbl)}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: lbl.color }}
                                />
                                <span className="truncate text-slate-800 dark:text-slate-200 font-medium">
                                  {lbl.name}
                                </span>
                              </div>
                              {isAssigned && (
                                <span className="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">
                                  check
                                </span>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Breadcrumb Info */}
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-mono">
            <span className="flex items-center gap-1 text-primary dark:text-indigo-400 font-medium">
              <span className="material-symbols-outlined text-[14px]">folder</span>
              <span>{currentFolder?.displayName || t('sidebar.folder.inbox')}</span>
            </span>
            <span>•</span>
            <span>#{selectedMessageDetail.id.slice(-6)}</span>
          </div>
        </div>

        {/* Sender details row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs flex-shrink-0">
              {initials}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {senderDisplayName}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                  &lt;{selectedMessageDetail.fromAddr}&gt;
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>
                  {t('reader.to_prefix', {
                    recipients: Array.isArray(recipientTo) && recipientTo.length > 0 ? recipientTo.join(', ') : t('reader.to_me')
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {formatDate(selectedMessageDetail.dateReceived, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-900/40">
                <span className="material-symbols-outlined text-[12px] text-emerald-600">verified</span>
                <span>{t('reader.security.dkim')}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-900/40">
                <span className="material-symbols-outlined text-[12px] text-primary">enhanced_encryption</span>
                <span>{t('reader.security.tls')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Remote images blocked warning banner */}
        {hasRemoteImages && !allowRemoteImages && (
          <div className="mt-1 flex items-center justify-between p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-amber-600">shield</span>
              <span>{t('reader.remote_images_warning')}</span>
            </div>
            <button
              type="button"
              onClick={() => setAllowRemoteImages(true)}
              className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold text-[11px] hover:bg-amber-700 transition-colors shadow-2xs"
            >
              {t('reader.show_remote_images')}
            </button>
          </div>
        )}
      </div>

      {/* Message Body iframe Container */}
      <div className="flex-1 relative w-full h-full min-h-[300px] overflow-hidden">
        <iframe
          title={t('reader.iframe_title')}
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          className="absolute inset-0 w-full h-full border-none"
          style={{ backgroundColor: isDark ? '#0f1522' : '#ffffff' }}
        />
      </div>

      {/* Inline Quick Reply Box (Aura Mail Design) */}
      <div className="p-3 sm:p-4 bg-slate-50 dark:bg-[#121826] border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-2">
        {/* Quick context chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[11px] text-slate-400 uppercase font-semibold flex-shrink-0">
            {t('reader.quick_reply.title')}
          </span>
          <button
            type="button"
            onClick={() => setQuickReplyText(t('reader.quick_reply.template1'))}
            className="px-2.5 py-1 rounded-full bg-white dark:bg-[#1a2333] border border-slate-200 dark:border-white/[0.06] text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#222e42] transition-colors whitespace-nowrap cursor-pointer"
          >
            „{t('reader.quick_reply.template1')}”
          </button>
          <button
            type="button"
            onClick={() => setQuickReplyText(t('reader.quick_reply.template2'))}
            className="px-2.5 py-1 rounded-full bg-white dark:bg-[#1a2333] border border-slate-200 dark:border-white/[0.06] text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#222e42] transition-colors whitespace-nowrap cursor-pointer"
          >
            „{t('reader.quick_reply.template2')}”
          </button>
        </div>

        {/* Input & Send row */}
        <div className="flex items-center gap-2 bg-white dark:bg-[#172030] rounded-xl border border-slate-200 dark:border-white/[0.08] px-3 py-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <textarea
            rows={1}
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            placeholder={t('reader.quick_reply.placeholder')}
            className="flex-1 bg-transparent border-none outline-none resize-none text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 py-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleQuickSend()
              }
            }}
          />

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onReply?.(selectedMessageDetail.fromAddr, `Re: ${selectedMessageDetail.subject}`)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('reader.quick_reply.open_full')}
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>

            <button
              type="button"
              disabled={isSendingQuickReply || !quickReplyText.trim()}
              onClick={handleQuickSend}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-container disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition-all"
            >
              <span>{t('reader.quick_reply.send')}</span>
              <span className="material-symbols-outlined text-[16px]">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
