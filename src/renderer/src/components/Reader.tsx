import React, { useEffect, useRef, useState } from 'react'
import { useMailStore } from '../state/mail-store'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation, getLocalizedLabelName } from '../i18n'
import { EmptyState } from './ui/EmptyState'
import { Skeleton } from './ui/Skeleton'
import { Button, Icon, IconButton } from './ui/Button'
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import { buildQuote, prefixSubject, textToHtml } from '../utils/quote'
import { canUsePlainShortcut, hasPrimaryModifier, hasShortcutOverlay, isTypingTarget, primaryModifierLabel } from '../utils/keyboard'
import { MailBody, hasRemoteImages as detectRemoteImages } from './MailBody'
import type { AttachmentSummary, MessageDetail } from '@shared/ipc'

interface ReaderProps {
  onReply?: (to: string, subject: string, bodyHtml?: string) => void
  onForward?: (subject: string, bodyHtml: string) => void
  onBack?: () => void
  isMobile?: boolean
  onToggleDossier?: () => void
  isDossierOpen?: boolean
  onOpenThreadDossier?: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function parseRecipients(json: string | undefined): string[] {
  try {
    const list = JSON.parse(json || '[]') as Array<{ name?: string; email?: string; address?: string } | string>
    return list.map((r) => (typeof r === 'string' ? r : r.name || r.email || r.address || '')).filter(Boolean)
  } catch {
    return []
  }
}

export function Reader({ onReply, onForward, onBack, isMobile, onToggleDossier, isDossierOpen, onOpenThreadDossier }: ReaderProps): JSX.Element {
  const {
    selectedMessageId,
    selectedMessageDetail: detail,
    selectedMessageAttachments,
    selectFolder,
    selectedFolderId,
    folders,
    setMessageFlags,
    moveMessage,
    downloadAttachment,
    refreshCurrentFolder
  } = useMailStore()
  const { labels, toggleMessageLabel } = useLabelsStore()
  const { t, formatDate } = useTranslation()
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)
  const [quickReply, setQuickReply] = useState('')
  const [quickState, setQuickState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [quickError, setQuickError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [savingAttachment, setSavingAttachment] = useState<string | null>(null)
  const autoMarkedIdsRef = useRef<Set<string>>(new Set())

  // Reset per-message UI state.
  useEffect(() => {
    setAllowRemoteImages(false)
    setQuickReply('')
    setQuickState('idle')
    setQuickError(null)
  }, [selectedMessageId])

  // Mark as read once the message has actually been shown for a moment (skips fast scrolling).
  useEffect(() => {
    if (!detail || detail.isRead) return
    const msgId = detail.id
    if (autoMarkedIdsRef.current.has(msgId)) return
    const timer = setTimeout(() => {
      const current = useMailStore.getState().selectedMessageDetail
      if (current && current.id === msgId && !current.isRead) {
        autoMarkedIdsRef.current.add(msgId)
        setMessageFlags(msgId, { isRead: true })
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [detail?.id, setMessageFlags])

  const quoteHeader = (d: MessageDetail): string =>
    t('reader.quote_header', { date: formatDate(d.dateReceived, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), name: d.fromName || d.fromAddr })

  const reply = (extraHtml = ''): void => {
    if (!detail) return
    onReply?.(detail.fromAddr, prefixSubject('Re', detail.subject || ''), extraHtml + buildQuote(detail, quoteHeader(detail)))
  }
  const forward = (): void => {
    if (!detail) return
    onForward?.(prefixSubject('Fwd', detail.subject || ''), detail.bodyHtml || textToHtml(detail.bodyPlain || ''))
  }

  // R = reply, F = forward (advertised in tooltips).
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || !canUsePlainShortcut(e) || isTypingTarget(e.target) || hasShortcutOverlay()) return
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        reply()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        forward()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!selectedMessageId) {
    return (
      <EmptyState
        icon="mail"
        title={t('reader.select_prompt_title')}
        description={t('reader.select_prompt')}
        hints={[
          { keys: 'C', label: t('emptyState.new_message') },
          { keys: `${primaryModifierLabel()}+K`, label: t('emptyState.search') },
          { keys: '↑ ↓', label: t('reader.hint_navigate') },
          { keys: 'R', label: t('reader.reply') }
        ]}
      />
    )
  }

  if (!detail) {
    return (
      <div className="h-full px-8 pt-8 flex flex-col gap-4" aria-busy="true">
        <Skeleton width="55%" height={24} />
        <div className="flex gap-3 items-center mt-2">
          <Skeleton width={36} height={36} round />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton width="30%" />
            <Skeleton width="20%" height={10} />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {[100, 96, 90, 70].map((w) => (
            <Skeleton key={w} width={`${w}%`} />
          ))}
        </div>
      </div>
    )
  }

  const archiveFolder = folders.find((f) => f.type === 'archive')
  const trashFolder = folders.find((f) => f.type === 'trash')
  const inArchive = detail.folderId === archiveFolder?.id
  const hasRemoteImages = detectRemoteImages(detail.bodyHtml)
  const sender = detail.fromName || detail.fromAddr
  const recipients = parseRecipients(detail.toJson)
  const cc = parseRecipients(detail.ccJson)
  const files = selectedMessageAttachments.filter((a) => !a.isInline)
  const assigned = new Set((detail.labels || []).map((l) => l.id))
  const initials = sender
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const openMenuAt = (e: React.MouseEvent, items: ContextMenuItem[]): void => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: r.left, y: r.bottom + 4, items })
  }

  const snooze = async (hours: number): Promise<void> => {
    await window.mailapp.messages.snooze(detail.id, new Date(Date.now() + hours * 3600_000).toISOString())
    if (selectedFolderId) await selectFolder(selectedFolderId)
    else await refreshCurrentFolder()
  }

  const saveAttachment = async (a: AttachmentSummary): Promise<void> => {
    const dir = await window.mailapp.files.pickSaveDirectory()
    if (!dir) return
    setSavingAttachment(a.id)
    try {
      await downloadAttachment(a.messageId, a.position, dir)
    } finally {
      setSavingAttachment(null)
    }
  }

  const sendQuickReply = async (): Promise<void> => {
    if (!quickReply.trim() || quickState === 'sending') return
    setQuickState('sending')
    setQuickError(null)
    try {
      await window.mailapp.messages.send({
        accountId: detail.accountId,
        to: [detail.fromAddr],
        cc: [],
        bcc: [],
        subject: prefixSubject('Re', detail.subject || ''),
        bodyHtml: textToHtml(quickReply) + buildQuote(detail, quoteHeader(detail)),
        attachments: []
      })
      setQuickReply('')
      setQuickState('sent')
    } catch (err) {
      setQuickError((err as Error).message)
      setQuickState('error')
    }
  }

  return (
    <article className="flex flex-col h-full min-h-0" aria-label={detail.subject || t('reader.no_subject')}>
      {/* Toolbar */}
      <div className="h-11 flex-shrink-0 flex items-center gap-1 px-3 border-b border-line print:hidden" role="toolbar" aria-label={t('reader.toolbar_aria')}>
        {isMobile && onBack && <IconButton icon="arrow_back" label={t('reader.back_to_list')} onClick={onBack} className="mr-1" />}
        <Button size="sm" icon="reply" onClick={() => reply()} title={`${t('reader.reply')} (R)`}>
          {t('reader.reply')}
        </Button>
        <Button size="sm" variant="ghost" icon="forward" onClick={forward} title={`${t('reader.forward')} (F)`}>
          <span className="max-sm:sr-only">{t('reader.forward')}</span>
        </Button>
        <span className="w-px h-4 bg-line mx-1.5" aria-hidden="true" />
        {archiveFolder && !inArchive && <IconButton icon="archive" label={t('reader.archive')} shortcut="E" onClick={() => moveMessage(detail.id, archiveFolder.id)} />}
        {trashFolder && detail.folderId !== trashFolder.id && (
          <IconButton icon="delete" label={t('reader.delete')} shortcut="Del" onClick={() => moveMessage(detail.id, trashFolder.id)} />
        )}
        <IconButton
          icon="snooze"
          label={t('reader.snooze')}
          onClick={(e) =>
            openMenuAt(
              e,
              (
                [
                  ['1h', 1],
                  ['evening', 6],
                  ['tomorrow', 24],
                  ['next_week', 168]
                ] as const
              ).map(([k, h]) => ({ key: k, label: t(`messageList.snooze.${k}`), icon: 'schedule', onSelect: () => snooze(h) }))
            )
          }
        />
        <IconButton
          icon="label"
          label={t('reader.add_label')}
          disabled={labels.length === 0}
          onClick={(e) =>
            openMenuAt(
              e,
              labels.map((lbl) => ({
                key: lbl.id,
                label: getLocalizedLabelName(lbl, t),
                icon: assigned.has(lbl.id) ? 'check' : undefined,
                onSelect: () => toggleMessageLabel(detail.id, lbl)
              }))
            )
          }
        />
        <IconButton icon="mark_email_unread" label={t('reader.mark_unread')} shortcut="U" onClick={() => setMessageFlags(detail.id, { isRead: false })} />
        <span className="flex-1" />
        <IconButton icon="print" label={t('reader.print')} onClick={() => window.print()} className="max-md:hidden" />
        {onOpenThreadDossier && <IconButton icon="forum" label={t('reader.view_thread_tooltip')} onClick={onOpenThreadDossier} />}
        {onToggleDossier && !isMobile && (
          <IconButton icon="side_navigation" label={t('reader.contact_card_tooltip')} aria-pressed={!!isDossierOpen} onClick={onToggleDossier} className="max-xl:hidden" />
        )}
      </div>

      {/* Header */}
      <header className="px-8 pt-6 pb-4 flex-shrink-0 selectable">
        <h1 className="font-bold tracking-[-0.02em] text-2xl text-ink text-pretty">
          {detail.subject || t('reader.no_subject')}
          {detail.isImportant && (
            <span className="chip !bg-warn-soft !text-warn align-middle ml-2 relative -top-0.5">
              <Icon name="priority_high" className="!text-[13px]" />
              {t('reader.priority')}
            </span>
          )}
        </h1>
        {(detail.labels || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(detail.labels || []).map((lbl) => (
              <span key={lbl.id} className="chip pr-0.5">
                <span className="chip-dot" style={{ backgroundColor: lbl.color }} />
                {getLocalizedLabelName(lbl, t)}
                <button
                  type="button"
                  onClick={() => toggleMessageLabel(detail.id, lbl)}
                  className="w-4 h-4 flex items-center justify-center rounded-sm hover:bg-hover"
                  aria-label={t('reader.remove_label', { name: lbl.name })}
                >
                  <Icon name="close" className="!text-[12px]" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-start gap-3 mt-5">
          <span className="w-9 h-9 flex-shrink-0 rounded-full bg-sunken text-ink-2 text-xs font-semibold flex items-center justify-center" aria-hidden="true">
            {initials}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-ink">{sender}</span>
              {detail.fromName && <span className="text-xs text-ink-3 truncate">{detail.fromAddr}</span>}
            </div>
            <p className="text-xs text-ink-3 mt-0.5 truncate" title={[...recipients, ...cc].join(', ')}>
              {t('reader.to_prefix', { recipients: recipients.length ? recipients.join(', ') : t('reader.to_me') })}
              {cc.length > 0 && `; ${t('reader.cc_prefix', { recipients: cc.join(', ') })}`}
            </p>
          </div>
          <time className="text-xs text-ink-3 whitespace-nowrap pt-0.5" dateTime={detail.dateReceived ?? undefined} title={formatDate(detail.dateReceived)}>
            {formatDate(detail.dateReceived, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-4" aria-label={t('reader.attachments', { count: files.length })}>
            {files.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => saveAttachment(a)}
                  disabled={savingAttachment === a.id}
                  title={a.localPath ? t('reader.attachment_saved', { path: a.localPath }) : t('reader.attachment_save')}
                  className="group h-10 max-w-[260px] flex items-center gap-2.5 pl-2.5 pr-3 rounded border border-line bg-raised hover:border-line-strong text-left"
                >
                  <Icon name={a.mimeType.startsWith('image/') ? 'image' : a.mimeType.includes('pdf') ? 'picture_as_pdf' : 'draft'} className="text-ink-3" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink">{a.filename}</span>
                    <span className="block text-2xs text-ink-3">
                      {formatBytes(a.sizeBytes)}
                      {a.localPath && `, ${t('reader.attachment_saved_short')}`}
                    </span>
                  </span>
                  <Icon name={savingAttachment === a.id ? 'progress_activity' : a.localPath ? 'check' : 'download'} className={`!text-[16px] text-ink-3 group-hover:text-ink ${savingAttachment === a.id ? 'animate-spin' : ''}`} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasRemoteImages && !allowRemoteImages && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded bg-sunken text-xs text-ink-2 print:hidden">
            <Icon name="shield" className="!text-[16px] text-ink-3" />
            <span className="flex-1">{t('reader.remote_images_warning')}</span>
            <Button size="xs" variant="secondary" onClick={() => setAllowRemoteImages(true)}>
              {t('reader.show_remote_images')}
            </Button>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 relative min-h-[240px]">
        <MailBody html={detail.bodyHtml} plain={detail.bodyPlain} allowRemoteImages={allowRemoteImages} title={t('reader.iframe_title')} />
      </div>

      {/* Quick reply — sends for real; "open in editor" keeps the typed text. */}
      <form
        className="flex-shrink-0 border-t border-line px-4 py-3 print:hidden"
        onSubmit={(e) => {
          e.preventDefault()
          sendQuickReply()
        }}
      >
        <div className="rounded border border-line-strong bg-raised focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)] transition-shadow">
          <label htmlFor="quick-reply" className="sr-only">
            {t('reader.quick_reply.placeholder')}
          </label>
          <textarea
            id="quick-reply"
            rows={quickReply ? 3 : 1}
            value={quickReply}
            onChange={(e) => {
              setQuickReply(e.target.value)
              if (quickState !== 'sending') setQuickState('idle')
            }}
            placeholder={t('reader.quick_reply.placeholder_to', { name: sender })}
            className="block w-full resize-none bg-transparent px-3 pt-2 pb-1 text-sm text-ink placeholder:text-ink-3 outline-none"
            onKeyDown={(e) => {
              if (!e.repeat && e.key === 'Enter' && hasPrimaryModifier(e.nativeEvent) && !hasShortcutOverlay()) {
                e.preventDefault()
                sendQuickReply()
              }
            }}
          />
          <div className="flex items-center gap-2 px-2 pb-1.5">
            <span className="flex-1 text-2xs truncate" aria-live="polite">
              {quickState === 'sent' && <span className="text-ok">{t('reader.quick_reply.sent')}</span>}
              {quickState === 'error' && <span className="text-danger">{quickError}</span>}
              {quickState === 'idle' && quickReply && <span className="text-ink-3">{t('reader.quick_reply.hint', { modifier: primaryModifierLabel() })}</span>}
            </span>
            <Button type="button" size="xs" variant="ghost" icon="open_in_full" onClick={() => reply(quickReply.trim() ? textToHtml(quickReply) : '')}>
              {t('reader.quick_reply.open_full')}
            </Button>
            <Button type="submit" size="xs" variant="primary" icon="send" loading={quickState === 'sending'} disabled={!quickReply.trim()}>
              {t('reader.quick_reply.send')}
            </Button>
          </div>
        </div>
      </form>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </article>
  )
}
