import React, { useState } from 'react'
import { Icon } from '../ui/Button'

// Pragmatic check for typos (missing @ / domain), not a full RFC 5322 parser.
export const isValidEmail = (s: string): boolean => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(s)

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

/** Address list as chips. Enter, comma, semicolon, space or blur commits; Backspace on empty removes the last chip. */
export function RecipientField({ id, label, value, onChange, draft, onDraftChange, placeholder, removeLabel, trailing, autoFocus }: RecipientFieldProps): JSX.Element {
  const [focused, setFocused] = useState(false)
  const commit = (raw: string): void => {
    const next = splitAddresses(raw).filter((a) => !value.includes(a))
    if (next.length) onChange([...value, ...next])
    onDraftChange('')
  }

  return (
    <div className={`flex items-start gap-3 min-h-[40px] px-5 py-1.5 border-b border-line ${focused ? 'bg-raised' : ''}`}>
      <label htmlFor={id} className="w-14 pt-[5px] text-sm text-ink-3 flex-shrink-0">
        {label}
      </label>
      <div className="flex-1 flex flex-wrap items-center gap-1 min-w-0">
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
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const v = e.target.value
            if (/[,;]\s*$/.test(v)) commit(v)
            else onDraftChange(v)
          }}
          onBlur={() => {
            setFocused(false)
            if (draft.trim()) commit(draft)
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (/[,;\s]/.test(text.trim())) {
              e.preventDefault()
              commit(draft + text)
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') && draft.trim()) {
              if (e.key !== 'Tab') e.preventDefault()
              commit(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          placeholder={value.length ? '' : placeholder}
          className="flex-1 min-w-[140px] h-7 bg-transparent text-sm text-ink placeholder:text-ink-3 outline-none"
        />
      </div>
      {trailing}
    </div>
  )
}
