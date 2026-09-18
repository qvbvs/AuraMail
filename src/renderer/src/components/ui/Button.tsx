import React, { forwardRef } from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger' | 'danger-subtle'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  loading?: boolean
  isIconOnly?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      icon,
      iconRight,
      loading = false,
      isIconOnly = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const classes = [
      'btn',
      `btn-${variant}`,
      size !== 'md' ? `btn-${size}` : '',
      isIconOnly ? 'btn-icon' : '',
      className
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? (
          <span
            style={{
              width: size === 'xs' || size === 'sm' ? 12 : 16,
              height: size === 'xs' || size === 'sm' ? 12 : 16,
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.7s linear infinite'
            }}
          />
        ) : (
          icon && <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '1.1em' }}>{icon}</span>
        )}
        {children}
        {!loading && iconRight && (
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '1.1em' }}>{iconRight}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
