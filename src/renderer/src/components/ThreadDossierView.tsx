import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMailStore } from '../state/mail-store'
import { useTranslation } from '../i18n'
import { ContactDossier } from './ContactDossier'
import { MailBody, hasRemoteImages } from './MailBody'
import { Button, Icon, IconButton } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Skeleton } from './ui/Skeleton'
import { buildQuote, prefixSubject, textToHtml } from '../utils/quote'
import type { MessageDetail, MessageListItem } from '@shared/ipc'

interface ThreadDossierViewProps {
  onBackToList: () => void
  onOpenCompose: (prefill?: { to?: string; subject?: string; bodyHtml?: string }) => void
}

const MIN_W = 280
const MAX_W = 640

/**
 * The open conversation as a stream: every message of the selected thread that is loaded in
 * the current list, oldest first, with the contact panel alongside.
 */
export function ThreadDossierView({ onBackToList, onOpenCompose }: ThreadDossierViewProps): JSX.Element {
  const { t, formatDate } = useTranslation()
  const { selectedMessageDetail: detail, messages, folders, setMessageFlags, moveMessage } = useMailStore()
  const [bodies, setBodies] = useState<Record<string, MessageDetail>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [remoteAllowed, setRemoteAllowed] = useState<Set<string>>(new Set())
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem('dossierWidth'))
    return Number.isFinite(stored) && stored >= MIN_W && stored <= MAX_W ? stored : 340
  })
  const markedRef = useRef<Set<string>>(new Set())

  const thread: MessageListItem[] = useMemo(() => {
    if (!detail) return []
    const same = detail.threadId ? messages.filter((m) => m.threadId === detail.threadId) : []
    const list = same.some((m) => m.id === detail.id) ? same : [...same, detail]
    return [...list].sort((a, b) => (a.dateReceived ?? '').localeCompare(b.dateReceived ?? ''))
  }, [detail, messages])

  // Open the selected message; collapse the rest of the conversation.
  useEffect(() => {
    if (detail) {
      setExpanded(new Set([detail.id]))
      setBodies((b) => ({ ...b, [detail.id]: detail }))
    }
  }, [detail?.id])

  // Lazily fetch bodies of other messages when expanded.
  useEffect(() => {
    for (const id of expanded) {
      if (bodies[id]) continue
      window.mailapp.messages
        .getBody(id)
        .then((d) => setBodies((b) => ({ ...b, [id]: d })))
        .catch(() => {})
    }
  }, [expanded, bodies])

  // Same rule as the reader: mark a message read once it has been shown.
  useEffect(() => {
    for (const id of expanded) {
      const m = thread.find((x) => x.id === id)
      if (m && !m.isRead && !markedRef.current.has(id)) {
        markedRef.current.add(id)
        setMessageFlags(id, { isRead: true })
      }
    }
  }, [expanded, thread, setMessageFlags])

  if (!detail) {
    return (
      <EmptyState
        icon="forum"
        title={t('threadDossier.empty_title')}
        description={t('threadDossier.empty_desc')}
        action={
          <Button size="sm" icon="arrow_back" onClick={onBackToList}>
            {t('threadDossier.back_to_list')}
          </Button>
        }
      />
    )
  }

  const archive = folders.find((f) => f.type === 'archive')
  const trash = folders.find((f) => f.type === 'trash')
  const quoteHeader = (d: MessageDetail): string =>
    t('reader.quote_header', { date: formatDate(d.dateReceived, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), name: d.fromName || d.fromAddr })
  const reply = (d: MessageDetail): void => onOpenCompose({ to: d.fromAddr, subject: prefixSubject('Re', d.subject || ''), bodyHtml: buildQuote(d, quoteHeader(d)) })
  const forward = (d: MessageDetail): void =>
    onOpenCompose({ subject: prefixSubject('Fwd', d.subject || ''), bodyHtml: `<p></p><p>${t('app.quote_fwd_prefix')}</p>${d.bodyHtml || textToHtml(d.bodyPlain || '')}` })
  const toggle = (id: string): void =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const latest = bodies[thread[thread.length - 1]?.id] ?? detail

  return (
    <div className="flex-1 min-w-0 flex">
      <section className="flex-1 min-w-0 flex flex-col" aria-label={detail.subject || t('reader.no_subject')}>
        <div className="h-11 flex-shrink-0 flex items-center gap-1 px-3 border-b border-line" role="toolbar" aria-label={t('reader.toolbar_aria')}>
          <IconButton icon="arrow_back" label={t('threadDossier.back_to_list')} onClick={onBackToList} />
          <span className="w-px h-4 bg-line mx-1.5" aria-hidden="true" />
          <Button size="sm" icon="reply" onClick={() => reply(latest)}>
            {t('reader.reply')}
          </Button>
          <Button size="sm" variant="ghost" icon="forward" onClick={() => forward(latest)}>
            {t('reader.forward')}
          </Button>
          <span className="flex-1" />
          {archive && detail.folderId !== archive.id && (
            <IconButton
              icon="archive"
              label={t('reader.archive')}
              onClick={async () => {
                await moveMessage(detail.id, archive.id)
                onBackToList()
              }}
            />
          )}
          {trash && detail.folderId !== trash.id && (
            <IconButton
              icon="delete"
              label={t('reader.delete')}
              onClick={async () => {
                await moveMessage(detail.id, trash.id)
                onBackToList()
              }}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <header className="px-8 pt-6 pb-4 max-w-[900px]">
            <h1 className="font-serif text-2xl font-medium text-ink text-pretty selectable">{detail.subject || t('reader.no_subject')}</h1>
            <p className="mt-1 text-xs text-ink-3">
              {t('threadDossier.messages_count', { count: thread.length })}
              {detail.threadCount > thread.length && ` · ${t('threadDossier.partial_note', { total: detail.threadCount })}`}
            </p>
          </header>

          <ol className="px-6 pb-10 max-w-[900px] flex flex-col gap-2">
            {thread.map((m) => {
              const open = expanded.has(m.id)
              const body = bodies[m.id]
              return (
                <li key={m.id} className={`rounded border ${open ? 'border-line-strong bg-panel' : 'border-line bg-raised/40'}`}>
                  <button type="button" aria-expanded={open} onClick={() => toggle(m.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <span className="w-8 h-8 rounded-full bg-sunken text-ink-2 text-2xs font-semibold flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      {(m.fromName || m.fromAddr)
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-sm truncate ${m.isRead ? 'text-ink' : 'text-ink font-semibold'}`}>{m.fromName || m.fromAddr}</span>
                        {open && m.fromName && <span className="text-xs text-ink-3 truncate">{m.fromAddr}</span>}
                      </span>
                      {!open && <span className="block text-xs text-ink-3 truncate">{m.snippet}</span>}
                    </span>
                    {m.hasAttachments && <Icon name="attach_file" className="!text-[15px] text-ink-3" />}
                    <time className="text-xs text-ink-3 whitespace-nowrap tabular-nums" dateTime={m.dateReceived ?? undefined}>
                      {formatDate(m.dateReceived, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </button>

                  {open && (
                    <div className="border-t border-line">
                      {!body ? (
                        <div className="px-8 py-5 flex flex-col gap-2.5" aria-busy="true">
                          <Skeleton width="90%" />
                          <Skeleton width="75%" />
                          <Skeleton width="60%" />
                        </div>
                      ) : (
                        <>
                          {hasRemoteImages(body.bodyHtml) && !remoteAllowed.has(m.id) && (
                            <div className="mx-8 mt-3 flex items-center gap-2 px-3 py-2 rounded bg-sunken text-xs text-ink-2">
                              <Icon name="shield" className="!text-[16px] text-ink-3" />
                              <span className="flex-1">{t('reader.remote_images_warning')}</span>
                              <Button size="xs" onClick={() => setRemoteAllowed((s) => new Set(s).add(m.id))}>
                                {t('reader.show_remote_images')}
                              </Button>
                            </div>
                          )}
                          <div className="pt-3">
                            <MailBody html={body.bodyHtml} plain={body.bodyPlain} allowRemoteImages={remoteAllowed.has(m.id)} title={t('reader.iframe_title')} sizing="auto" />
                          </div>
                          <div className="flex gap-1 px-6 pb-3">
                            <Button size="xs" variant="ghost" icon="reply" onClick={() => reply(body)}>
                              {t('reader.reply')}
                            </Button>
                            <Button size="xs" variant="ghost" icon="forward" onClick={() => forward(body)}>
                              {t('reader.forward')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <div className="max-lg:hidden flex">
        <ContactDossier
          width={panelWidth}
          onWidthChange={(w) => {
            setPanelWidth(w)
            localStorage.setItem('dossierWidth', String(w))
          }}
          onOpenCompose={(p) => onOpenCompose(p)}
        />
      </div>
    </div>
  )
}
