import React, { useEffect, useState } from 'react'
import { isValidEmail } from '../../../../shared/email-address'
import { useTranslation } from '../../i18n'
import { useContactsStore } from '../../state/contacts-store'
import { contactMatches, contactName } from '../../utils/contacts'
import { Icon } from '../ui/Button'

export { isValidEmail }

export function splitAddresses(raw: string): string[] {
  return raw
    .replace(/[^,;<>]*<([^>]+)>/g, ' $1 ') // "Name <a@b.c>" → a@b.c
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^<|>$/g, ''))
    .filter(Boolean)
}

interface RecipientFieldProps {
  id: string
  label: string
  value: string[]
  onChange: (next: string[]) => void
  draft: string
  onDraftChange: (draft: string) => void
  placeholder?: string
  removeLabel: (addr: string) => string
  trailing?: React.ReactNode
  autoFocus?: boolean
}

/** Address chips with an address-book combobox and keyboard selection. */
export function RecipientField({ id, label, value, onChange, draft, onDraftChange, placeholder, removeLabel, trailing, autoFocus }: RecipientFieldProps): JSX.Element {
  const { t, locale } = useTranslation()
  const contacts = useContactsStore((state) => state.contacts)
  const loadContacts = useContactsStore((state) => state.load)
  const [focused, setFocused] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)

  useEffect(() => { void loadContacts() }, [loadContacts])

  const selectedAddresses = new Set(value.map((address) => address.toLowerCase()))
  const suggestions = focused && draft.trim()
    ? contacts.filter((contact) => contact.email && !selectedAddresses.has(contact.email.toLowerCase()) && contactMatches(contact, draft))
      .sort((left, right) => (contactName(left) || left.email).localeCompare(contactName(right) || right.email, locale))
      .slice(0, 6)
    : []
  const showSuggestions = !suggestionsDismissed && suggestions.length > 0
  const listId = `${id}-suggestions`

  const commit = (raw: string): void => {
    const next = splitAddresses(raw).filter((address) => {
      const normalized = address.toLowerCase()
      if (selectedAddresses.has(normalized)) return false
      selectedAddresses.add(normalized)
      return true
    })
    if (next.length) onChange([...value, ...next])
    setActiveSuggestion(-1)
    onDraftChange('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    if (showSuggestions) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const current = activeSuggestion < 0 && direction === -1 ? 0 : activeSuggestion
        setActiveSuggestion((current + direction + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setSuggestionsDismissed(true)
        setActiveSuggestion(-1)
        return
      }
      const active = suggestions[activeSuggestion]
      if (event.key === 'Enter' && active) {
        event.preventDefault()
        commit(active.email)
        return
      }
      if ((event.key === ' ' || event.key === 'Tab') && !isValidEmail(draft.trim())) return
    }
    if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Tab') && draft.trim()) {
      if (event.key !== 'Tab') event.preventDefault()
      commit(draft)
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className={`flex items-start gap-3 min-h-[40px] px-5 py-1.5 border-b border-line ${focused ? 'bg-raised' : ''}`}>
      <label htmlFor={id} className="w-14 pt-[5px] text-sm text-ink-3 flex-shrink-0">
        {label}
      </label>
      <div className="relative flex-1 flex flex-wrap items-center gap-1 min-w-0">
        {value.map((addr) => {
          const ok = isValidEmail(addr)
          return (
            <span key={addr} className={`chip !h-6 !text-xs pr-0.5 ${ok ? '' : '!bg-danger-soft !text-danger'}`} title={ok ? addr : undefined}>
              {!ok && <Icon name="error" className="!text-[13px]" />}
              {addr}
              <button type="button" onClick={() => onChange(value.filter((a) => a !== addr))} className="w-5 h-5 flex items-center justify-center rounded-sm hover:bg-hover" aria-label={removeLabel(addr)}>
                <Icon name="close" className="!text-[13px]" />
              </button>
            </span>
          )
        })}
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={showSuggestions && suggestions[activeSuggestion] ? `${listId}-${activeSuggestion}` : undefined}
          value={draft}
          onFocus={() => {
            setFocused(true)
            setSuggestionsDismissed(false)
          }}
          onChange={(e) => {
            const v = e.target.value
            setActiveSuggestion(-1)
            setSuggestionsDismissed(false)
            if (/[,;]\s*$/.test(v)) commit(v)
            else onDraftChange(v)
          }}
          onBlur={() => {
            setFocused(false)
            setActiveSuggestion(-1)
            if (draft.trim()) commit(draft)
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (/[,;\s]/.test(text.trim())) {
              e.preventDefault()
              commit(draft + text)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={value.length ? '' : placeholder}
          className="flex-1 min-w-[140px] h-7 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none"
        />
        {showSuggestions && (
          <ul id={listId} role="listbox" aria-label={t('contacts.suggestions')}
            className="absolute z-20 left-0 right-0 top-full mt-1 p-1 rounded-lg border border-line bg-raised shadow-lg">
            {suggestions.map((contact, index) => {
              const name = contactName(contact)
              return (
                <li key={contact.id} id={`${listId}-${index}`} role="option" aria-selected={activeSuggestion === index}
                  onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActiveSuggestion(index)}
                  onClick={() => commit(contact.email)}
                  className={`cursor-pointer rounded px-2 py-1.5 ${activeSuggestion === index ? 'bg-hover' : ''}`}>
                  <span className="block truncate text-sm font-medium text-ink">{name || contact.email}</span>
                  {name && <span className="block truncate text-xs text-ink-3">{contact.email}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {trailing}
    </div>
  )
}
