import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useMailStore } from '../state/mail-store'
import { useTranslation } from '../i18n'

interface ThreadDossierViewProps {
  onBackToList: () => void
  onOpenCompose: (prefill?: { to?: string; subject?: string; bodyHtml?: string }) => void
}

const MIN_DOSSIER_WIDTH = 280
const MAX_DOSSIER_WIDTH = 640

export function ThreadDossierView({ onBackToList, onOpenCompose }: ThreadDossierViewProps): JSX.Element {
  const { t } = useTranslation()
  const { selectedMessageDetail, setMessageFlags } = useMailStore()
  const [quickReply, setQuickReply] = useState('')
  const [isStarred, setIsStarred] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [notes, setNotes] = useState(t('threadDossier.demo_notes_default'))
  const autoMarkedIdsRef = useRef<Set<string>>(new Set())

  // Automatyczne oznaczanie przeczytania po otwarciu w widoku wątku
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

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem('dossierWidth'))
    return Number.isFinite(stored) && stored >= MIN_DOSSIER_WIDTH && stored <= MAX_DOSSIER_WIDTH ? stored : 384
  })
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const getDynamicMaxWidth = useCallback(() => Math.max(MIN_DOSSIER_WIDTH, Math.min(MAX_DOSSIER_WIDTH, window.innerWidth - 360)), [])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizeStartRef.current = { startX: e.clientX, startWidth: panelWidth }
      setResizing(true)
    },
    [panelWidth]
  )

  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e: MouseEvent): void => {
      const start = resizeStartRef.current
      if (!start) return
      const dx = start.startX - e.clientX
      const next = Math.min(getDynamicMaxWidth(), Math.max(MIN_DOSSIER_WIDTH, start.startWidth + dx))
      setPanelWidth(next)
      localStorage.setItem('dossierWidth', String(next))
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
  }, [resizing, getDynamicMaxWidth])

  useEffect(() => {
    const handleResize = (): void => {
      const max = getDynamicMaxWidth()
      setPanelWidth((w) => (w > max ? max : w))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [getDynamicMaxWidth])

  const subject = selectedMessageDetail?.subject || t('threadDossier.demo_subject_fallback')
  const sender = selectedMessageDetail?.fromName || t('threadDossier.demo_sender1_name')
  const senderEmail = selectedMessageDetail?.fromAddr || 'elena.rostova@techcorp.io'
  const senderInitials = sender.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'ER'
  const myInitials = 'AM'

  const copyToClipboard = (text: string, field: string): void => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleSendQuickReply = (): void => {
    if (!quickReply.trim()) return
    onOpenCompose({
      to: senderEmail,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      bodyHtml: `<p>${quickReply}</p><br><p>---</p>`
    })
    setQuickReply('')
  }

  return (
    <div className="flex-1 flex flex-row w-full h-full min-h-[calc(100vh-3.5rem)] bg-background dark:bg-[#0b0f19] text-on-surface dark:text-slate-100 overflow-hidden select-none">
      {/* 1. CENTRAL CONVERSATION STREAM */}
      <section className="flex-1 flex flex-col min-w-0 bg-surface-container-low/30 dark:bg-slate-900/30 overflow-y-auto border-r border-border-subtle dark:border-white/[0.06]">
        {/* Thread Action Toolbar */}
        <div className="sticky top-0 z-30 bg-surface-container-lowest/95 dark:bg-[#121826]/95 backdrop-blur-md px-space-lg py-space-md border-b border-border-subtle dark:border-white/[0.06] shadow-sm flex flex-col gap-space-sm">
          <div className="flex items-center justify-between gap-space-md flex-wrap">
            {/* Subject & Priority Badges */}
            <div className="flex items-center gap-space-sm min-w-0">
              <button
                type="button"
                onClick={onBackToList}
                className="p-1 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white transition-colors"
                title={t('threadDossier.back_to_list')}
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <h1 className="font-headline-md text-headline-md text-on-surface dark:text-white font-semibold truncate tracking-tight">
                {subject}
              </h1>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="font-label-mono text-caption px-space-xs py-0.5 rounded-full bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 font-semibold">
                  #Q3-ARCH
                </span>
                <span className="font-label-mono text-caption px-space-xs py-0.5 rounded-full bg-surface-container-highest dark:bg-slate-800 text-on-surface-variant dark:text-text-muted">
                  #DevOps
                </span>
                <span className="font-caption text-caption px-space-xs py-0.5 rounded-full bg-error-container dark:bg-rose-950/60 text-on-error-container dark:text-rose-300 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-error dark:bg-rose-500" />
                  {t('reader.priority')}
                </span>
              </div>
            </div>

            {/* Quick Email Actions */}
            <div className="flex items-center gap-1 text-on-surface-variant dark:text-text-muted">
              <button
                type="button"
                className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
                title={t('threadDossier.archive_tooltip')}
              >
                <span className="material-symbols-outlined text-[19px]">archive</span>
              </button>
              <button
                type="button"
                className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
                title={t('threadDossier.report_spam_tooltip')}
              >
                <span className="material-symbols-outlined text-[19px]">report</span>
              </button>
              <button
                type="button"
                className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 hover:text-error transition-colors"
                title={t('threadDossier.delete_thread_tooltip')}
              >
                <span className="material-symbols-outlined text-[19px]">delete</span>
              </button>
              <span className="h-4 w-px bg-outline-variant/40 dark:bg-white/10 mx-1" />
              <button
                type="button"
                className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 hover:text-on-surface dark:hover:text-white transition-colors"
                title={t('threadDossier.mark_unread_tooltip')}
              >
                <span className="material-symbols-outlined text-[19px]">mark_email_unread</span>
              </button>
              <button
                type="button"
                onClick={() => setIsStarred(!isStarred)}
                className={`p-1.5 rounded-xl transition-colors ${
                  isStarred
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'hover:bg-surface-container-high dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
                }`}
                title={t('reader.star')}
              >
                <span
                  className="material-symbols-outlined text-[19px]"
                  style={{ fontVariationSettings: isStarred ? "'FILL' 1" : "'FILL' 0" }}
                >
                  star
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`p-1.5 rounded-xl transition-colors ${
                  isPinned
                    ? 'text-primary dark:text-indigo-400'
                    : 'hover:bg-surface-container-high dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted'
                }`}
                title={t('threadDossier.pin_top_tooltip')}
              >
                <span className="material-symbols-outlined text-[19px]">keep</span>
              </button>
            </div>
          </div>

          {/* Breadcrumb Info Bar */}
          <div className="flex items-center justify-between font-caption text-caption text-on-surface-variant dark:text-text-muted pt-1">
            <div className="flex items-center gap-space-sm">
              <span className="flex items-center gap-1 text-primary dark:text-indigo-400 font-medium">
                <span className="material-symbols-outlined text-[15px]">folder_open</span>
                {t('threadDossier.breadcrumb_demo')}
              </span>
              <span>•</span>
              <span className="font-label-mono text-caption">{t('threadDossier.thread_id_label', { id: '#TH-8942-PL' })}</span>
            </div>
            <div className="flex items-center gap-space-sm">
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full font-medium">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                {t('threadDossier.tls_dkim_badge')}
              </span>
            </div>
          </div>
        </div>

        {/* Message Chronological Stream */}
        <div className="flex flex-col gap-space-md p-space-lg max-w-5xl w-full mx-auto">
          {/* Message 1: Collapsed Summary */}
          <details className="group bg-surface-container-lowest dark:bg-[#121826] rounded-xl shadow-sm border border-border-subtle dark:border-white/[0.06] transition-all duration-200">
            <summary className="flex items-center justify-between p-space-md cursor-pointer select-none list-none rounded-xl hover:bg-surface-container-low dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-space-md min-w-0">
                <div className="w-8 h-8 rounded-full bg-secondary-fixed dark:bg-blue-950 text-on-secondary-fixed dark:text-blue-300 flex items-center justify-center font-headline-md text-caption font-bold flex-shrink-0">
                  {senderInitials}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-space-sm min-w-0">
                  <span className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white">
                    {t('threadDossier.demo_sender1_name')}
                  </span>
                  <span className="font-body-sm text-caption text-on-surface-variant dark:text-text-muted truncate">
                    {t('threadDossier.demo_msg1_snippet')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-md flex-shrink-0">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant dark:text-text-muted">
                  attach_file
                </span>
                <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                  {t('threadDossier.demo_time_2days')}
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </div>
            </summary>
            <div className="px-space-md pb-space-md pt-space-xs text-body-md font-body-md text-on-surface-variant dark:text-slate-300 border-t border-border-subtle dark:border-white/[0.04]">
              <p className="leading-relaxed">
                {t('threadDossier.demo_msg1_greeting')}<br /><br />
                {t('threadDossier.demo_msg1_body')}
              </p>
              <div className="mt-space-md p-space-sm rounded-lg bg-surface-container-low dark:bg-slate-800 inline-flex items-center gap-space-sm border border-border-subtle dark:border-white/[0.04]">
                <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[18px]">description</span>
                <span className="font-body-sm text-body-sm font-medium text-on-surface dark:text-white">
                  {t('threadDossier.demo_attachment1_name')}
                </span>
                <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">2.1 MB</span>
              </div>
            </div>
          </details>

          {/* Message 2: Collapsed Summary */}
          <details className="group bg-surface-container-lowest dark:bg-[#121826] rounded-xl shadow-sm border border-border-subtle dark:border-white/[0.06] transition-all duration-200">
            <summary className="flex items-center justify-between p-space-md cursor-pointer select-none list-none rounded-xl hover:bg-surface-container-low dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-space-md min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 flex items-center justify-center font-headline-md text-caption font-bold flex-shrink-0">
                  {myInitials}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-space-sm min-w-0">
                  <span className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white">
                    {t('threadDossier.demo_sender2_name')}
                  </span>
                  <span className="font-body-sm text-caption text-on-surface-variant dark:text-text-muted truncate">
                    {t('threadDossier.demo_msg2_snippet')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-md flex-shrink-0">
                <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                  {t('threadDossier.demo_time_yesterday')}
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </div>
            </summary>
            <div className="px-space-md pb-space-md pt-space-xs text-body-md font-body-md text-on-surface-variant dark:text-slate-300 border-t border-border-subtle dark:border-white/[0.04]">
              <p className="leading-relaxed">
                {t('threadDossier.demo_msg2_greeting')}<br /><br />
                {t('threadDossier.demo_msg2_body')}
              </p>
            </div>
          </details>

          {/* Message 3: Expanded Latest Active Message */}
          <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl shadow-md overflow-hidden border border-border-subtle dark:border-white/[0.06]">
            {/* Active Message Header */}
            <div className="p-space-lg flex flex-col gap-space-md">
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex items-start gap-space-md min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-secondary-fixed dark:bg-blue-950 text-on-secondary-fixed dark:text-blue-300 font-bold flex items-center justify-center text-title-sm shadow-sm ring-2 ring-primary/20">
                      {senderInitials}
                    </div>
                    <span
                      className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-surface-container-lowest dark:ring-[#121826]"
                      title={t('threadDossier.active_now')}
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-space-sm flex-wrap">
                      <span className="font-title-sm text-body-lg font-bold text-on-surface dark:text-white">
                        {sender}
                      </span>
                      <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted">
                        &lt;{senderEmail}&gt;
                      </span>
                      <span className="font-label-mono text-caption bg-secondary-fixed dark:bg-blue-950 text-on-secondary-fixed dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                        {t('threadDossier.demo_org_tag')}
                      </span>
                    </div>
                    <div className="flex items-center gap-space-xs font-caption text-caption text-on-surface-variant dark:text-text-muted mt-0.5">
                      <span>
                        {t('composer.to')} <strong className="font-medium text-on-surface dark:text-white">{t('threadDossier.demo_recipient_name')}</strong> &lt;jan@mailapp.pl&gt;
                      </span>
                      <span>•</span>
                      <span>
                        {t('composer.cc')} <span className="text-on-surface-variant dark:text-text-muted">{t('threadDossier.demo_team_name')}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-space-sm flex-shrink-0">
                  <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                    {t('threadDossier.demo_timestamp')}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenCompose({ to: senderEmail, subject: `Re: ${subject}` })}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container dark:bg-slate-800 hover:bg-surface-container-high text-on-surface dark:text-white font-title-sm text-caption font-semibold transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">reply</span>
                    <span>{t('reader.reply')}</span>
                  </button>
                </div>
              </div>

              {/* Message Content */}
              <div className="pt-space-md border-t border-border-subtle dark:border-white/[0.04] text-body-lg font-body-lg text-on-surface dark:text-slate-200 leading-relaxed space-y-4">
                <p>{t('threadDossier.demo_msg3_greeting')}</p>
                <p>
                  {t('threadDossier.demo_msg3_body1')}
                </p>
                <p>
                  {t('threadDossier.demo_msg3_body2')}
                </p>
                <p>
                  {t('threadDossier.demo_signoff')}<br />
                  <strong>{t('threadDossier.demo_sender1_name')}</strong><br />
                  <span className="text-caption text-on-surface-variant dark:text-text-muted">
                    {t('threadDossier.demo_job_title_dot')}
                  </span>
                </p>
              </div>

              {/* Attachment card */}
              <div className="mt-2 p-space-md rounded-xl bg-surface-container-low dark:bg-slate-800/60 border border-border-subtle dark:border-white/[0.04] flex items-center justify-between gap-space-md">
                <div className="flex items-center gap-space-md min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-error-container/60 dark:bg-rose-950 text-error dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white truncate">
                      {t('threadDossier.demo_attachment2_name')}
                    </span>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                      3.4 MB • {t('composer.attachments_scanned')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alert(t('threadDossier.demo_download_alert'))}
                  className="p-2 rounded-lg hover:bg-surface-container dark:hover:bg-slate-700 text-on-surface-variant hover:text-on-surface dark:hover:text-white transition-colors"
                  title={t('threadDossier.download_file_tooltip')}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Reply Form Strip */}
          <div className="bg-surface-container-lowest dark:bg-[#121826] rounded-xl p-space-md shadow-sm border border-border-subtle dark:border-white/[0.06] space-y-space-sm">
            <div className="flex items-center justify-between text-caption font-title-sm text-on-surface-variant dark:text-text-muted font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary dark:text-indigo-400">quickreply</span>
                <span>{t('threadDossier.quick_reply_to', { name: sender })}</span>
              </div>
              <span className="font-label-mono text-[10px]">{t('threadDossier.ctrl_enter_hint')}</span>
            </div>

            <div className="relative">
              <textarea
                value={quickReply}
                onChange={(e) => setQuickReply(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    handleSendQuickReply()
                  }
                }}
                rows={3}
                className="w-full bg-surface-container-low dark:bg-slate-900/80 rounded-xl p-space-md text-on-surface dark:text-white font-body-sm text-body-sm outline-none focus:ring-1 focus:ring-primary border border-border-subtle dark:border-white/[0.04] resize-none"
                placeholder={t('reader.quick_reply.placeholder')}
              />
            </div>

            {/* AI Suggestion Chips */}
            <div className="flex items-center gap-space-xs overflow-x-auto pb-1 text-caption">
              <span className="font-label-mono text-[11px] text-on-surface-variant dark:text-text-muted flex items-center gap-1 flex-shrink-0">
                <span className="material-symbols-outlined text-[14px] text-primary dark:text-indigo-400">auto_awesome</span>
                {t('threadDossier.suggestions_label')}
              </span>
              <button
                type="button"
                onClick={() => setQuickReply(t('threadDossier.suggestion1'))}
                className="px-2.5 py-1 rounded-full bg-surface-container dark:bg-slate-800 hover:bg-surface-container-high text-on-surface dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                „{t('threadDossier.suggestion1')}”
              </button>
              <button
                type="button"
                onClick={() => setQuickReply(t('threadDossier.suggestion2'))}
                className="px-2.5 py-1 rounded-full bg-surface-container dark:bg-slate-800 hover:bg-surface-container-high text-on-surface dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                „{t('threadDossier.suggestion2')}”
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 text-on-surface-variant dark:text-text-muted">
                <button type="button" className="p-1 rounded hover:bg-surface-container" title={t('composer.attach')}>
                  <span className="material-symbols-outlined text-[18px]">attach_file</span>
                </button>
                <button type="button" className="p-1 rounded hover:bg-surface-container" title={t('threadDossier.insert_emoji_tooltip')}>
                  <span className="material-symbols-outlined text-[18px]">mood</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSendQuickReply}
                disabled={!quickReply.trim()}
                className="flex items-center gap-1 px-space-md py-1.5 rounded-xl bg-primary-container dark:bg-indigo-600 hover:bg-primary dark:hover:bg-indigo-500 text-white font-title-sm text-caption font-semibold transition-all shadow-sm disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                <span>{t('threadDossier.send_reply_btn')}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. RIGHT-HAND CONTACT DOSSIER PANEL (regulowana szerokość) */}
      <aside
        style={{ width: panelWidth, minWidth: MIN_DOSSIER_WIDTH, maxWidth: MAX_DOSSIER_WIDTH }}
        className="relative flex-shrink-0 bg-surface-container-lowest dark:bg-[#121826] shadow-[-2px_0_12px_rgba(0,0,0,0.03)] flex flex-col z-20 overflow-y-auto max-h-[calc(100vh-3.5rem)] select-none"
      >
        <div
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('contactDossier.resize_label')}
          title={t('contactDossier.resize_hint')}
          className={`absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-30 ${
            resizing ? 'bg-primary/40' : 'hover:bg-primary/30'
          }`}
        />
        {/* Dossier Header & Profile */}
        <div className="p-space-lg bg-gradient-to-b from-surface-container dark:from-slate-800/40 to-surface-container-lowest dark:to-[#121826] flex flex-col items-center text-center relative border-b border-border-subtle dark:border-white/[0.04]">
          <div className="relative mt-space-sm mb-space-sm">
            <div className="w-20 h-20 rounded-full bg-secondary-fixed dark:bg-blue-950 text-on-secondary-fixed dark:text-blue-300 font-headline-xl text-headline-xl font-bold flex items-center justify-center shadow-md ring-4 ring-surface-container-lowest dark:ring-[#121826]">
              {senderInitials}
            </div>
            <span
              className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full ring-2 ring-surface-container-lowest dark:ring-[#121826]"
              title={t('threadDossier.active_now_system')}
            />
          </div>

          <h2 className="font-headline-md text-headline-md font-bold text-on-surface dark:text-white tracking-tight">
            {sender}
          </h2>
          <p className="font-title-sm text-caption text-primary dark:text-indigo-400 font-semibold mt-0.5">
            {t('threadDossier.demo_job_title_amp')}
          </p>
          <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant dark:text-text-muted">
            <span className="material-symbols-outlined text-[15px] text-secondary">domain</span>
            <span>{t('threadDossier.demo_org_full')}</span>
            <span>•</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{t('threadDossier.active_now')}</span>
          </div>

          {/* Quick Actions Row */}
          <div className="grid grid-cols-4 gap-2 w-full mt-space-md">
            <button
              type="button"
              onClick={() => onOpenCompose({ to: senderEmail, subject: t('threadDossier.compose_subject_to', { name: sender }) })}
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-primary-container dark:bg-indigo-600 text-white hover:bg-primary dark:hover:bg-indigo-500 transition-all shadow-sm group"
              title={t('contactDossier.action_write_tooltip')}
            >
              <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">mail</span>
              <span className="font-label-md text-[10px] mt-1 font-medium">{t('contactDossier.action_write')}</span>
            </button>

            <button
              type="button"
              onClick={() => alert(t('threadDossier.demo_meet_alert', { name: sender }))}
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container dark:bg-slate-800 text-on-surface dark:text-white hover:bg-surface-container-high transition-all group"
              title={t('contactDossier.action_meet_tooltip')}
            >
              <span className="material-symbols-outlined text-[20px] text-secondary group-hover:scale-110 transition-transform">
                video_call
              </span>
              <span className="font-label-md text-[10px] mt-1 font-medium">{t('contactDossier.action_meet')}</span>
            </button>

            <button
              type="button"
              onClick={() => alert(t('threadDossier.demo_calendar_alert'))}
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container dark:bg-slate-800 text-on-surface dark:text-white hover:bg-surface-container-high transition-all group"
              title={t('contactDossier.action_meeting_tooltip')}
            >
              <span className="material-symbols-outlined text-[20px] text-primary dark:text-indigo-400 group-hover:scale-110 transition-transform">
                calendar_today
              </span>
              <span className="font-label-md text-[10px] mt-1 font-medium">{t('contactDossier.action_meeting')}</span>
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard('+48 601 234 567', 'phone')}
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container dark:bg-slate-800 text-on-surface dark:text-white hover:bg-surface-container-high transition-all group"
              title={t('threadDossier.call_mobile_tooltip')}
            >
              <span className="material-symbols-outlined text-[20px] text-tertiary group-hover:scale-110 transition-transform">
                call
              </span>
              <span className="font-label-md text-[10px] mt-1 font-medium">{t('contactDossier.action_call')}</span>
            </button>
          </div>
        </div>

        {/* CRM Metrics Strip */}
        <div className="p-space-md bg-surface-container-low/60 dark:bg-slate-900/60 mx-space-md rounded-xl mt-space-xs grid grid-cols-2 gap-space-sm border border-border-subtle dark:border-white/[0.04]">
          <div className="bg-surface-container-lowest dark:bg-[#121826] p-space-sm rounded-lg flex flex-col">
            <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted uppercase tracking-wider">
              {t('contactDossier.metric_threads')}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-headline-md text-headline-md font-bold text-on-surface dark:text-white">48</span>
              <span className="font-caption text-caption text-emerald-600 dark:text-emerald-400 font-medium">
                {t('threadDossier.threads_delta', { count: 12 })}
              </span>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark:bg-[#121826] p-space-sm rounded-lg flex flex-col">
            <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted uppercase tracking-wider">
              {t('threadDossier.avg_response_time_label')}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-headline-md text-headline-md font-bold text-primary dark:text-indigo-400">28 min</span>
              <span className="font-caption text-[10px] text-on-surface-variant dark:text-text-muted">{t('threadDossier.fast_label')}</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark:bg-[#121826] p-space-sm rounded-lg flex flex-col col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted uppercase tracking-wider">
                {t('threadDossier.collab_sentiment_label')}
              </span>
              <span className="font-label-md text-caption text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.2 rounded-full font-semibold">
                {t('threadDossier.sentiment_positive', { pct: 96 })}
              </span>
            </div>
            <div className="w-full bg-surface-container-highest dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '96%' }} />
            </div>
          </div>
        </div>

        {/* Contact Data Details */}
        <div className="p-space-lg flex flex-col gap-space-sm">
          <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-bold">
            {t('contactDossier.sec_title')}
          </span>

          <div className="space-y-1.5 mt-1 font-body-sm text-body-sm">
            {/* Email */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800/60 transition-colors group">
              <div className="flex items-center gap-space-sm min-w-0">
                <span className="material-symbols-outlined text-on-surface-variant dark:text-text-muted text-[18px]">
                  mail
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted">{t('contactDossier.email')}</span>
                  <span className="font-body-sm font-medium text-on-surface dark:text-white truncate">{senderEmail}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(senderEmail, 'email')}
                className="p-1 text-on-surface-variant hover:text-primary transition-colors"
                title={t('contactDossier.copy_email')}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedField === 'email' ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>

            {/* Phone */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800/60 transition-colors group">
              <div className="flex items-center gap-space-sm min-w-0">
                <span className="material-symbols-outlined text-on-surface-variant dark:text-text-muted text-[18px]">
                  phone
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted">{t('threadDossier.phone_label')}</span>
                  <span className="font-body-sm font-medium text-on-surface dark:text-white">+48 601 234 567</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard('+48 601 234 567', 'phone')}
                className="p-1 text-on-surface-variant hover:text-primary transition-colors"
                title={t('threadDossier.copy_phone_tooltip')}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedField === 'phone' ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>

            {/* Timezone */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-slate-800/60 transition-colors">
              <div className="flex items-center gap-space-sm min-w-0">
                <span className="material-symbols-outlined text-on-surface-variant dark:text-text-muted text-[18px]">
                  location_on
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted">
                    {t('threadDossier.location_tz_label')}
                  </span>
                  <span className="font-body-sm font-medium text-on-surface dark:text-white">
                    {t('threadDossier.demo_location_value')}
                  </span>
                </div>
              </div>
              <span className="font-label-mono text-caption px-2 py-0.5 rounded bg-surface-container dark:bg-slate-800 text-on-surface dark:text-white font-semibold">
                11:02 CET
              </span>
            </div>
          </div>

          {/* CRM Private Notes */}
          <div className="mt-space-md pt-space-sm border-t border-border-subtle dark:border-white/[0.06] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-bold">
                {t('threadDossier.private_notes_crm')}
              </span>
              <span className="material-symbols-outlined text-primary text-[16px]">edit_note</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-surface-container-low dark:bg-slate-900/80 rounded-lg p-2 text-caption text-on-surface dark:text-slate-300 outline-none border border-border-subtle dark:border-white/[0.04] resize-none"
            />
          </div>
        </div>
      </aside>
    </div>
  )
}
