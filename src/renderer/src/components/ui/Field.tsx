import React, { useId } from 'react'

export interface FieldProps {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  className?: string
  /** Receives the generated id so the control can be wired to label/hint/error. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode
}

/** Label + control + hint/error, with the aria wiring done once. */
export function Field({ label, hint, error, className = '', children }: FieldProps): JSX.Element {
  const id = useId()
  const descId = error || hint ? `${id}-desc` : undefined
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      {children({ id, describedBy: descId, invalid: Boolean(error) })}
      {error ? (
        <span id={descId} className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={descId} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  )
}

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
}

/** Settings-row toggle: text on the left, switch on the right, whole row clickable. */
export function SwitchRow({ checked, onChange, label, description, disabled, ...props }: SwitchProps): JSX.Element {
  const id = useId()
  return (
    <label htmlFor={id} className={`flex items-start justify-between gap-6 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block mt-0.5 text-xs text-ink-3">{description}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...props}
      />
    </label>
  )
}
