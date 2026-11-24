import React, { useId, useState } from 'react'
import { isValidEmail } from '@shared/email-address'
import type { ContactFields, SaveContactInput } from '@shared/ipc'
import { useTranslation } from '../i18n'
import { useContactsStore } from '../state/contacts-store'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { Modal } from './ui/Modal'

const inputFields = [
  { key: 'firstName', label: 'contacts.first_name', maxLength: 100, type: 'text' },
  { key: 'lastName', label: 'contacts.last_name', maxLength: 100, type: 'text' },
  { key: 'email', label: 'contacts.email', maxLength: 254, type: 'email' },
  { key: 'company', label: 'contacts.company', maxLength: 200, type: 'text' },
  { key: 'phone', label: 'contacts.phone', maxLength: 80, type: 'tel' }
] as const

interface ContactEditorProps {
  initialContact: SaveContactInput
  onClose: () => void
  onSaved?: () => void
}

export function ContactEditor({ initialContact, onClose, onSaved }: ContactEditorProps): JSX.Element {
  const { t } = useTranslation()
  const [contact, setContact] = useState(initialContact)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'invalid_email' | 'duplicate_email' | 'save' | null>(null)
  const save = useContactsStore((state) => state.save)
  const formId = useId()

  const changeField = (field: keyof ContactFields, value: string): void => {
    setContact((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    if (!isValidEmail(contact.email.trim())) {
      setError('invalid_email')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await save(contact)
      if (result.ok) {
        onSaved?.()
        onClose()
      } else {
        setError(result.reason)
      }
    } catch {
      setError('save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t(contact.id ? 'contacts.edit' : 'contacts.add')}
      closeOnBackdrop={false}
      dismissible={!busy}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>{t('common.save')}</Button>
        </>
      }
    >
      <form id={formId} className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
        {inputFields.map(({ key, label, maxLength, type }) => (
          <Field key={key} label={t(label)} className={key === 'email' ? 'sm:col-span-2' : ''}
            error={key === 'email' && error && error !== 'save' ? t(`contacts.${error}`) : undefined}>
            {({ id, describedBy, invalid }) => (
              <input id={id} className="input" type={type} value={contact[key]} maxLength={maxLength} required={key === 'email'}
                disabled={busy} onChange={(event) => changeField(key, event.target.value)} aria-invalid={invalid} aria-describedby={describedBy} />
            )}
          </Field>
        ))}
        <Field label={t('contacts.notes')} className="sm:col-span-2">
          {({ id }) => (
            <textarea id={id} className="textarea" rows={3} value={contact.notes} maxLength={2000} disabled={busy}
              onChange={(event) => changeField('notes', event.target.value)} />
          )}
        </Field>
        {error === 'save' && <p className="text-sm text-danger sm:col-span-2" role="alert">{t('common.error')}</p>}
      </form>
    </Modal>
  )
}
