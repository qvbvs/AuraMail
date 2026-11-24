import React, { useEffect, useState } from 'react'
import type { ContactSummary, SaveContactInput } from '@shared/ipc'
import { useTranslation } from '../i18n'
import { useContactsStore } from '../state/contacts-store'
import { contactMatches, contactName, emptyContact } from '../utils/contacts'
import { ContactEditor } from './ContactEditor'
import { Button, Icon, IconButton, Spinner } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Modal } from './ui/Modal'

interface ContactsViewProps {
  onOpenCompose: (prefill: { to: string }) => void
}

export function ContactsView({ onOpenCompose }: ContactsViewProps): JSX.Element {
  const { t, locale } = useTranslation()
  const { contacts, status, load, remove } = useContactsStore()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<SaveContactInput | null>(null)
  const [deleting, setDeleting] = useState<ContactSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  useEffect(() => { void load() }, [load])

  const filtered = contacts.filter((contact) => contactMatches(contact, query)).sort((left, right) => (
    (contactName(left) || left.email).localeCompare(contactName(right) || right.email, locale)
  ))

  const confirmDelete = async (): Promise<void> => {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(false)
    try {
      await remove(deleting.id)
      setDeleting(null)
    } catch {
      setDeleteError(true)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="min-w-0 flex-1 flex flex-col h-full bg-panel" aria-labelledby="contacts-title">
      <header className="border-b border-line px-5 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <h1 id="contacts-title" className="text-xl font-semibold text-ink">{t('contacts.title')}</h1>
          <Button variant="primary" icon="person_add" onClick={() => setEditing(emptyContact)} disabled={status !== 'ready'}>
            {t('contacts.add')}
          </Button>
        </div>
        <div className="relative mt-4 w-full max-w-sm">
          <Icon name="search" className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3 pointer-events-none" />
          <input className="input !pl-9" type="search" aria-label={t('contacts.search')} placeholder={t('contacts.search')}
            value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </header>
      {status === 'error' && (
        <EmptyState icon="error" title={t('common.error')} tone="danger"
          action={<Button icon="refresh" onClick={() => void load()}>{t('common.refresh')}</Button>} />
      )}
      {(status === 'idle' || status === 'loading') && <div className="p-7 text-ink-3"><Spinner /></div>}
      {status === 'ready' && filtered.length === 0 && (
        contacts.length === 0
          ? <EmptyState icon="contacts" title={t('contacts.empty_title')} description={t('contacts.empty_description')} />
          : <EmptyState icon="search_off" title={t('contacts.no_results')} />
      )}
      {status === 'ready' && filtered.length > 0 && (
        <div className="min-h-0 overflow-y-auto">
          <ul className="px-4 sm:px-7">
            {filtered.map((contact) => {
              const name = contactName(contact)
              const details = [name ? contact.email : '', contact.company, contact.phone].filter(Boolean)
              return (
                <li key={contact.id} className="flex items-center gap-3 min-w-0 py-3 border-b border-line">
                  <span className="w-9 h-9 flex shrink-0 items-center justify-center rounded-full bg-sunken text-ink-3">
                    <Icon name="person" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{name || contact.email}</p>
                    {details.length > 0 && <p className="truncate text-xs text-ink-3" title={details.join(' · ')}>{details.join(' · ')}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton size="sm" icon="mail" label={t('contacts.write')} disabled={!contact.email}
                      onClick={() => onOpenCompose({ to: contact.email })} />
                    <IconButton size="sm" icon="edit" label={t('contacts.edit')} onClick={() => setEditing(contact)} />
                    <IconButton size="sm" icon="delete" label={t('common.delete')}
                      onClick={() => { setDeleting(contact); setDeleteError(false) }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {editing && <ContactEditor initialContact={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Modal open size="sm" title={t('contacts.delete_title')} dismissible={!deleteBusy} onClose={() => setDeleting(null)}
          footer={
            <>
              <Button disabled={deleteBusy} onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" loading={deleteBusy} onClick={confirmDelete}>{t('common.delete')}</Button>
            </>
          }>
          <p className="text-sm text-ink-2">{t('contacts.delete_description', { contact: contactName(deleting) || deleting.email })}</p>
          {deleteError && <p role="alert" className="mt-3 text-sm text-danger">{t('common.error')}</p>}
        </Modal>
      )}
    </section>
  )
}
