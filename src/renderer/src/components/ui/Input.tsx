import React, { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  prefixIcon?: React.ReactNode
  suffixIcon?: React.ReactNode
  containerStyle?: React.CSSProperties
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefixIcon, suffixIcon, required, containerStyle, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

    return (
      <div className="form-group" style={containerStyle}>
        {label && (
          <label
            htmlFor={inputId}
            className={`form-label ${required ? 'form-label-required' : ''}`}
          >
            {label}
          </label>
        )}
        <div className="input-wrapper">
          {prefixIcon && <span className="input-prefix-icon">{prefixIcon}</span>}
          <input
            id={inputId}
            ref={ref}
            required={required}
            className={`input-field ${prefixIcon ? 'input-with-prefix' : ''} ${className}`}
            style={{
              borderColor: error ? 'var(--color-danger)' : undefined,
              paddingRight: suffixIcon ? 32 : undefined
            }}
            {...props}
          />
          {suffixIcon && (
            <span
              style={{
                position: 'absolute',
                right: 10,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer'
              }}
            >
              {suffixIcon}
            </span>
          )}
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

Input.displayName = 'Input'
