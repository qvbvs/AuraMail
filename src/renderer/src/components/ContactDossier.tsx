import React, { useCallback, useEffect, useRef, useState } from 'react'
import { isValidEmail } from '@shared/email-address'
import type { SaveContactInput } from '@shared/ipc'
import { useMailStore } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useContactsStore } from '../state/contacts-store'
import { useTranslation } from '../i18n'
import { contactName, emptyContact } from '../utils/contacts'
import { ContactEditor } from './ContactEditor'
import { Button, IconButton } from './ui/Button'

interface ContactDossierProps {
  onClose?: () => void
  onOpenCompose?: (prefill: { to: string; subject?: string }) => void
  width: number
  onWidthChange: (width: number) => void
}

const MIN_DOSSIER_WIDTH = 280
const MAX_DOSSIER_WIDTH = 640

/** Side panel about the sender of the open message: facts, other mail, a persisted private note. */
export function ContactDossier({ onClose, onOpenCompose, width, onWidthChange }: ContactDossierProps): JSX.Element | null {
  const { t, formatDate } = useTranslation()
  const { selectedMessageDetail, messages, selectMessage } = useMailStore()
  const accounts = useAccountsStore((s) => s.accounts)
  const { contacts, status: contactsStatus, load: loadContacts, save: saveContact } = useContactsStore()
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [editingContact, setEditingContact] = useState<SaveContactInput | null>(null)
  const [draftNote, setDraftNote] = useState<{ email: string; text: string } | null>(null)
  const [legacyNote, setLegacyNote] = useState<{ key: string; text: string } | null>(null)
  const [noteStatus, setNoteStatus] = useState<{ email: string; state: 'saving' | 'saved' | 'error' } | null>(null)

  const senderEmail = selectedMessageDetail?.fromAddr ?? ''
  // Settings keys are capped at 100 chars by the main process.
  const noteKey = `contact_note:${senderEmail.toLowerCase()}`.slice(0, 100)
  const contact = contacts.find((entry) => entry.email.toLowerCase() === senderEmail.toLowerCase())
  const hasContact = Boolean(contact)
  const savedNote = contact?.notes ?? (legacyNote?.key === noteKey ? legacyNote.text : '')
  const note = draftNote?.email === senderEmail ? draftNote.text : savedNote
  const noteState = noteStatus?.email === senderEmail ? noteStatus.state : 'idle'

  useEffect(() => { void loadContacts() }, [loadContacts])

  // Keep list + reader usable: the panel never takes more than window − 480px.
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
      onWidthChange(Math.min(getDynamicMaxWidth(), Math.max(MIN_DOSSIER_WIDTH, start.startWidth + start.startX - e.clientX)))
    }
    const handleMouseUp = (): void => {
      setResizing(false)
      resizeStartRef.current = null
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    const prevCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = prevCursor
    }
  }, [resizing, onWidthChange, getDynamicMaxWidth])

  useEffect(() => {
    const handleResize = (): void => {
      const max = getDynamicMaxWidth()
      if (width > max) onWidthChange(max)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [width, onWidthChange, getDynamicMaxWidth])

  useEffect(() => {
    if (!senderEmail || hasContact) return
    let cancelled = false
    window.mailapp.settings
      .get(noteKey)
      .then((v) => {
        if (cancelled) return
        setLegacyNote({ key: noteKey, text: v ?? '' })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hasContact, noteKey, senderEmail])

  if (!selectedMessageDetail) return null

  const senderName = (contact && contactName(contact)) || selectedMessageDetail.fromName || senderEmail.split('@')[0]
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : ''
  const related = messages.filter((m) => m.id !== selectedMessageDetail.id && m.fromAddr.toLowerCase() === senderEmail.toLowerCase())
  const dates = [selectedMessageDetail, ...related].map((m) => (m.dateReceived ? new Date(m.dateReceived).getTime() : NaN)).filter((n) => !isNaN(n))
  const lastContact = dates.length ? new Date(Math.max(...dates)) : null
  const firstContact = dates.length ? new Date(Math.min(...dates)) : null
  const account = accounts.find((a) => a.id === selectedMessageDetail.accountId)
  const initials = senderName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const saveNote = async (): Promise<void> => {
    const text = note.trim()
    setNoteStatus({ email: senderEmail, state: 'saving' })
    try {
      if (contact) {
        const result = await saveContact({ ...contact, notes: text })
        if (!result.ok) throw new Error(result.reason)
      } else {
        await window.mailapp.settings.set(noteKey, text)
        setLegacyNote({ key: noteKey, text })
      }
      setDraftNote((current) => current === draftNote ? null : current)
      setNoteStatus({ email: senderEmail, state: 'saved' })
    } catch {
      setNoteStatus({ email: senderEmail, state: 'error' })
    }
  }

  const editSender = (): void => {
    if (contact) {
      setEditingContact({ ...contact, notes: note })
    } else {
      const [firstName = '', ...lastName] = selectedMessageDetail.fromName.trim().split(/\s+/)
      setEditingContact({ ...emptyContact, firstName: firstName.slice(0, 100), lastName: lastName.join(' ').slice(0, 100), email: senderEmail, notes: note })
    }
  }

  return (
    <aside
      aria-label={t('contactDossier.title')}
      style={{ width, minWidth: MIN_DOSSIER_WIDTH, maxWidth: MAX_DOSSIER_WIDTH }}
      className="relative flex-shrink-0 h-full overflow-y-auto border-l border-line bg-panel print:hidden"
    >
      <div
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('contactDossier.resize_label')}
        title={t('contactDossier.resize_hint')}
        className={`absolute left-0 inset-y-0 w-1 -ml-px cursor-col-resize z-10 ${resizing ? 'bg-accent' : 'hover:bg-line-strong'}`}
      />

      <div className="h-11 flex items-center justify-between pl-5 pr-2 border-b border-line">
        <h2 className="eyebrow">{t('contactDossier.title')}</h2>
        {onClose && <IconButton icon="close" size="sm" label={t('contactDossier.close')} onClick={onClose} />}
      </div>

      <div className="px-5 pt-5 pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-sunken text-ink-2 font-semibold flex items-center justify-center flex-shrink-0" aria-hidden="true">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-bold tracking-[-0.02em] text-lg text-ink truncate">{senderName}</p>
            {senderDomain && (
              <button
                type="button"
                onClick={() => window.mailapp.shell.openExternal(`https://${senderDomain}`)}
                title={t('contactDossier.open_domain_tooltip', { domain: senderDomain })}
                className="text-xs text-ink-3 hover:text-accent-ink hover:underline"
              >
                {senderDomain}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 h-8 pl-2.5 pr-1 rounded bg-sunken">
          <span className="flex-1 truncate text-xs text-ink selectable">{senderEmail}</span>
          <IconButton
            size="xs"
            icon={copiedEmail ? 'check' : 'content_copy'}
            label={copiedEmail ? t('contactDossier.copied') : t('contactDossier.copy_email')}
            onClick={() => {
              navigator.clipboard.writeText(senderEmail)
              setCopiedEmail(true)
              setTimeout(() => setCopiedEmail(false), 1500)
            }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" icon="edit" onClick={() => onOpenCompose?.({ to: senderEmail })} title={t('contactDossier.action_write_tooltip')}>
            {t('contactDossier.action_write')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="event"
            onClick={() => onOpenCompose?.({ to: senderEmail, subject: t('contactDossier.action_meeting_subject') })}
            title={t('contactDossier.action_meeting_tooltip')}
          >
            {t('contactDossier.action_meeting')}
          </Button>
        </div>
        {isValidEmail(senderEmail) && contactsStatus === 'ready' && (
          <Button size="sm" variant="ghost" icon={contact ? 'edit' : 'person_add'} className="mt-2" onClick={editSender}>
            {t(contact ? 'contacts.edit' : 'contacts.save_sender')}
          </Button>
        )}
      </div>

      <dl className="px-5 py-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs border-b border-line">
        <dt className="text-ink-3">{t('contactDossier.metric_threads')}</dt>
        <dd className="text-ink tabular-nums text-right">{related.length + 1}</dd>
        <dt className="text-ink-3">{t('contactDossier.metric_last_contact')}</dt>
        <dd className="text-ink text-right">{lastContact ? formatDate(lastContact, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</dd>
        {firstContact && related.length > 0 && (
          <>
            <dt className="text-ink-3">{t('contactDossier.metric_first_contact')}</dt>
            <dd className="text-ink text-right">{formatDate(firstContact, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          </>
        )}
        <dt className="text-ink-3">{t('contactDossier.account_label')}</dt>
        <dd className="text-ink text-right truncate">{account?.displayName || account?.email || '-'}</dd>
      </dl>

      <section className="px-5 py-4 border-b border-line">
        <h3 className="eyebrow mb-2">{t('contactDossier.tab_threads', { count: related.length })}</h3>
        {related.length === 0 ? (
          <p className="text-xs text-ink-3">{t('contactDossier.no_history')}</p>
        ) : (
          <ul className="-mx-2">
            {related.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => selectMessage(m.id)} className="w-full text-left px-2 py-1.5 rounded hover:bg-hover">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 truncate text-xs font-medium text-ink">{m.subject || t('reader.no_subject')}</span>
                    <span className="text-2xs text-ink-3 tabular-nums">{m.dateReceived ? formatDate(m.dateReceived, { day: 'numeric', month: 'short' }) : ''}</span>
                  </span>
                  {m.snippet && <span className="block truncate text-2xs text-ink-3 mt-0.5">{m.snippet}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-5 py-4">
        <label htmlFor="contact-note" className="eyebrow block mb-2">
          {t('contactDossier.notes_title')}
        </label>
        <textarea
          id="contact-note"
          className="textarea !text-xs"
          maxLength={2000}
          rows={4}
          placeholder={t('contactDossier.notes_placeholder_input')}
          value={note}
          disabled={noteState === 'saving'}
          onChange={(e) => {
            setDraftNote({ email: senderEmail, text: e.target.value })
            setNoteStatus(null)
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-2xs text-ink-3" aria-live="polite">
            {noteState === 'saved' ? t('contactDossier.notes_saved') : noteState === 'error' ? t('common.error') : t('contactDossier.notes_local_hint')}
          </span>
          <Button size="xs" variant="secondary" loading={noteState === 'saving'} disabled={note.trim() === savedNote} onClick={saveNote}>
            {t('contactDossier.notes_save')}
          </Button>
        </div>
      </section>
      {editingContact && (
        <ContactEditor initialContact={editingContact} onClose={() => setEditingContact(null)}
          onSaved={() => setDraftNote((current) => current === draftNote ? null : current)} />
      )}
    </aside>
  )
}
