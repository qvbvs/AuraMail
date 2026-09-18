import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useMailStore } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useTranslation } from '../i18n'

interface ContactDossierProps {
  onClose?: () => void
  onOpenCompose?: (prefill: { to: string; subject?: string }) => void
  width: number
  onWidthChange: (width: number) => void
}

const MIN_DOSSIER_WIDTH = 280
const MAX_DOSSIER_WIDTH = 640

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ContactDossier({ onClose, onOpenCompose, width, onWidthChange }: ContactDossierProps): JSX.Element | null {
  const { t, formatDate } = useTranslation()
  const { selectedMessageDetail, messages, selectMessage, selectedMessageAttachments } = useMailStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const [activeTab, setActiveTab] = useState<'history' | 'files'>('history')
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Panel nie może zająć więcej niż zostawiając rozsądne minimum na sidebar+listę+czytnik.
  const getDynamicMaxWidth = useCallback(() => Math.max(MIN_DOSSIER_WIDTH, Math.min(MAX_DOSSIER_WIDTH, window.innerWidth - 480)), [])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizeStartRef.current = { startX: e.clientX, startWidth: width }
      setResizing(true)
    },
    [width]
  )

  useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (e: MouseEvent): void => {
      const start = resizeStartRef.current
      if (!start) return
      // Panel jest po prawej stronie — przeciąganie w lewo (ujemne dx) zwiększa szerokość.
      const dx = start.startX - e.clientX
      const next = Math.min(getDynamicMaxWidth(), Math.max(MIN_DOSSIER_WIDTH, start.startWidth + dx))
      onWidthChange(next)
    }
    const handleMouseUp = (): void => {
      setResizing(false)
      resizeStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [resizing, onWidthChange, getDynamicMaxWidth])

  // Jeśli okno się skurczy (np. zmiana rozmiaru okna aplikacji), przytnij wcześniej
  // zapisaną szerokość panelu tak, żeby lista i czytnik zawsze miały minimum miejsca.
  useEffect(() => {
    const handleResize = (): void => {
      const max = getDynamicMaxWidth()
      if (width > max) onWidthChange(max)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [width, onWidthChange, getDynamicMaxWidth])
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [note, setNote] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(note)

  if (!selectedMessageDetail) {
    return null
  }

  const senderName = selectedMessageDetail.fromName || selectedMessageDetail.fromAddr.split('@')[0]
  const senderEmail = selectedMessageDetail.fromAddr
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : 'poczta.pl'

  // Find other messages from this sender in the store
  const relatedMessages = messages.filter(
    (m) =>
      m.id !== selectedMessageDetail.id &&
      (m.fromAddr.toLowerCase() === senderEmail.toLowerCase() ||
        (m.fromName && m.fromName.toLowerCase() === senderName.toLowerCase()))
  )

  const threadDates = [selectedMessageDetail, ...relatedMessages]
    .map((m) => m.dateReceived)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
  const lastContact = threadDates.length > 0 ? new Date(Math.max(...threadDates)) : null
  const firstContact = threadDates.length > 0 ? new Date(Math.min(...threadDates)) : null

  const handleCopyEmail = (): void => {
    navigator.clipboard.writeText(senderEmail)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

  const initials = senderName
    ? senderName
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'KO'

  return (
    <aside
      aria-label={t('contactDossier.title')}
      style={{ width, minWidth: MIN_DOSSIER_WIDTH, maxWidth: MAX_DOSSIER_WIDTH }}
      className="relative flex-shrink-0 bg-white dark:bg-[#121826] border-l border-slate-200 dark:border-white/[0.06] shadow-[-2px_0_12px_rgba(0,0,0,0.03)] flex flex-col z-20 overflow-y-auto max-h-[calc(100vh-3.5rem)] select-none text-slate-800 dark:text-slate-100"
    >
      {/* Uchwyt do zmiany szerokości panelu (przeciągnij w poziomie) */}
      <div
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('contactDossier.resize_label')}
        title={t('contactDossier.resize_hint')}
        className={`absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-30 group ${
          resizing ? 'bg-primary/40' : 'hover:bg-primary/30'
        }`}
      >
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-transparent group-hover:bg-primary/50" />
      </div>

      {/* Dossier Header & Profile Overview */}
      <div className="p-5 bg-gradient-to-b from-slate-100 dark:from-[#182234] to-white dark:to-[#121826] flex flex-col items-center text-center relative border-b border-slate-200/60 dark:border-white/[0.06]">
        {/* Top Right Action Buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title={t('contactDossier.close')}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Avatar with Live Status */}
        <div className="relative mt-2 mb-2">
          <div className="w-18 h-18 rounded-full bg-gradient-to-tr from-primary to-indigo-500 text-white font-bold text-xl flex items-center justify-center shadow-md ring-4 ring-white dark:ring-[#121826]">
            {initials}
          </div>
          <span
            className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-[#121826]"
            title={t('contactDossier.available')}
          />
        </div>

        <h2 className="font-headline text-base font-bold text-slate-900 dark:text-white tracking-tight">
          {senderName}
        </h2>
        <p className="font-mono text-xs text-primary dark:text-indigo-400 font-semibold mt-0.5">
          {senderDomain}
        </p>

        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="material-symbols-outlined text-[14px] text-indigo-500">domain</span>
          <span>{senderDomain}</span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t('contactDossier.active')}</span>
        </div>

        {/* Primary Quick Actions Row */}
        <div className="grid grid-cols-4 gap-2 w-full mt-4">
          <button
            type="button"
            onClick={() => onOpenCompose?.({ to: senderEmail })}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-primary text-white hover:bg-primary-container transition-all shadow-sm group"
            title={t('contactDossier.action_write_tooltip')}
          >
            <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">
              mail
            </span>
            <span className="text-[10px] mt-1 font-medium">{t('contactDossier.action_write')}</span>
          </button>

          <a
            href={`https://meet.google.com/new`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-[#1a2333] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#222e42] transition-all group"
            title={t('contactDossier.action_meet_tooltip')}
          >
            <span className="material-symbols-outlined text-[18px] text-cyan-600 dark:text-cyan-400 group-hover:scale-110 transition-transform">
              video_call
            </span>
            <span className="text-[10px] mt-1 font-medium">{t('contactDossier.action_meet')}</span>
          </a>

          <button
            type="button"
            onClick={() => onOpenCompose?.({ to: senderEmail, subject: t('contactDossier.action_meeting_subject') })}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-[#1a2333] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#222e42] transition-all group"
            title={t('contactDossier.action_meeting_tooltip')}
          >
            <span className="material-symbols-outlined text-[18px] text-primary dark:text-indigo-400 group-hover:scale-110 transition-transform">
              calendar_today
            </span>
            <span className="text-[10px] mt-1 font-medium">{t('contactDossier.action_meeting')}</span>
          </button>

          <a
            href={`tel:+48`}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-[#1a2333] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#222e42] transition-all group"
            title={t('contactDossier.action_call_tooltip')}
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              call
            </span>
            <span className="text-[10px] mt-1 font-medium">{t('contactDossier.action_call')}</span>
          </a>
        </div>
      </div>

      {/* CRM Metrics & Engagement Strip */}
      <div className="p-3 bg-slate-50 dark:bg-[#162030] mx-4 rounded-xl mt-3 grid grid-cols-2 gap-2 border border-slate-200/60 dark:border-white/[0.04]">
        <div className="bg-white dark:bg-[#121826] p-2.5 rounded-lg flex flex-col border border-slate-100 dark:border-white/[0.04]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
            {t('contactDossier.metric_threads')}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-headline text-base font-bold text-slate-900 dark:text-white">
              {relatedMessages.length + 1}
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {t('contactDossier.metric_in_inbox')}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#121826] p-2.5 rounded-lg flex flex-col border border-slate-100 dark:border-white/[0.04]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
            {t('contactDossier.metric_last_contact')}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-headline text-base font-bold text-primary dark:text-indigo-400">
              {lastContact ? formatDate(lastContact, { day: 'numeric', month: 'short' }) : '—'}
            </span>
          </div>
        </div>

        {firstContact && relatedMessages.length > 0 && (
          <div className="bg-white dark:bg-[#121826] p-2.5 rounded-lg flex flex-col col-span-2 border border-slate-100 dark:border-white/[0.04]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
              {t('contactDossier.metric_first_contact')}
            </span>
            <span className="font-headline text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {formatDate(firstContact, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* Telecommunication & Security Specifications */}
      <div className="p-4 flex flex-col gap-2">
        <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
          {t('contactDossier.sec_title')}
        </span>

        <div className="space-y-2 font-body text-xs">
          {/* Email Field */}
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1a2333] transition-colors group">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">mail</span>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{t('contactDossier.email')}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{senderEmail}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyEmail}
              className="p-1 text-slate-400 hover:text-primary transition-colors"
              title={copiedEmail ? t('contactDossier.copied') : t('contactDossier.copy_email')}
            >
              <span className="material-symbols-outlined text-[16px]">
                {copiedEmail ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>

          {/* Konto, do którego przypisany jest wątek */}
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1a2333] transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">inbox</span>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{t('contactDossier.account_label')}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                  {accounts.find((a) => a.id === selectedMessageDetail.accountId)?.displayName ||
                    accounts.find((a) => a.id === selectedMessageDetail.accountId)?.email ||
                    '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CRM Tabbed Section: Historia & Pliki */}
      <div className="px-4 flex flex-col flex-1">
        <div className="flex border-b border-slate-200 dark:border-white/[0.06] gap-4 mb-2">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'text-primary border-primary'
                : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t('contactDossier.tab_threads', { count: relatedMessages.length })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'files'
                ? 'text-primary border-primary'
                : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t('contactDossier.tab_attachments', { count: selectedMessageAttachments.filter((a) => !a.isInline).length })}
          </button>
        </div>

        {/* Thread History List */}
        {activeTab === 'history' ? (
          <div className="space-y-1.5 mb-4">
            {relatedMessages.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
                {t('contactDossier.no_history')}
              </p>
            ) : (
              relatedMessages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => selectMessage(m.id)}
                  className="p-2 rounded-xl bg-slate-50 dark:bg-[#1a2333] hover:bg-slate-100 dark:hover:bg-[#222e42] transition-all cursor-pointer border border-slate-100 dark:border-white/[0.04]"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {m.subject || t('reader.no_subject')}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">
                      {m.dateReceived ? formatDate(m.dateReceived, { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  </div>
                  {m.snippet && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {m.snippet}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1.5 mb-4">
            {selectedMessageAttachments.filter((a) => !a.isInline).length > 0 ? (
              selectedMessageAttachments
                .filter((a) => !a.isInline)
                .map((att) => (
                  <div
                    key={att.id}
                    className="p-2 rounded-xl bg-slate-50 dark:bg-[#1a2333] flex items-center justify-between border border-slate-100 dark:border-white/[0.04]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                      <span className="text-xs text-slate-800 dark:text-slate-200 truncate font-medium">
                        {att.filename}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">
                      {formatBytes(att.sizeBytes)}
                    </span>
                  </div>
                ))
            ) : selectedMessageDetail.hasAttachments ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
                {t('contactDossier.attachments_loading')}
              </p>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
                {t('contactDossier.attachments_empty')}
              </p>
            )}
          </div>
        )}

        {/* Private CRM Notes Section */}
        <div className="mt-2 mb-4 pt-3 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">sticky_note_2</span>
              <span>{t('contactDossier.notes_crm')}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                if (editingNote) {
                  setNote(noteDraft)
                  setEditingNote(false)
                } else {
                  setNoteDraft(note)
                  setEditingNote(true)
                }
              }}
              className="text-xs text-primary hover:underline font-semibold"
            >
              {editingNote ? t('contactDossier.notes_save') : t('contactDossier.notes_edit_btn')}
            </button>
          </div>

          {editingNote ? (
            <textarea
              className="w-full p-2 text-xs rounded-xl bg-white dark:bg-[#162030] border border-primary/50 text-slate-800 dark:text-slate-100 focus:outline-none resize-none h-20"
              placeholder={t('contactDossier.notes_placeholder_input')}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
          ) : note ? (
            <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-slate-800 dark:text-slate-200 flex flex-col gap-1 shadow-xs">
              <p className="text-xs leading-relaxed text-amber-950 dark:text-amber-200">„{note}”</p>
              <div className="flex items-center justify-between text-[10px] text-amber-800/80 dark:text-amber-400/70 pt-1 mt-1 border-t border-amber-200/50 dark:border-amber-900/30">
                <span>{t('contactDossier.notes_session_notice')}</span>
                <span className="material-symbols-outlined text-[14px]">lock</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2 text-center">{t('contactDossier.notes_empty_hint')}</p>
          )}
        </div>
      </div>
    </aside>
  )
}
