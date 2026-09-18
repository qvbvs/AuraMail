import React, { forwardRef } from 'react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  containerStyle?: React.CSSProperties
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, required, containerStyle, className = '', id, children, ...props }, ref) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

    return (
      <div className="form-group" style={containerStyle}>
        {label && (
          <label
            htmlFor={selectId}
            className={`form-label ${required ? 'form-label-required' : ''}`}
          >
            {label}
          </label>
        )}
        <div className="input-wrapper">
          <select
            id={selectId}
            ref={ref}
            required={required}
            className={`select-field ${className}`}
            style={{
              borderColor: error ? 'var(--color-danger)' : undefined
            }}
            {...props}
          >
            {children}
          </select>
        </div>
        {error && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', marginTop: 2 }}>
            {error}
          </span>
        )}
        {hint && !error && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {hint}
          </span>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
