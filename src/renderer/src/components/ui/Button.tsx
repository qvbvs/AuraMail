import React, { forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Material Symbols ligature name, or a node. */
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  loading?: boolean
}

export function Icon({ name, className = '', fill = false }: { name: string; className?: string; fill?: boolean }): JSX.Element {
  return (
    <span className={`material-symbols-outlined${fill ? ' fill' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}

const renderIcon = (icon: React.ReactNode): React.ReactNode => (typeof icon === 'string' ? <Icon name={icon} /> : icon)

export function Spinner({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <span
      role="status"
      aria-label="…"
      className="inline-block rounded-full border-2 border-current border-t-transparent animate-[spin_.7s_linear_infinite]"
      style={{ width: size, height: size }}
    />
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, iconRight, loading = false, className = '', children, disabled, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === 'xs' || size === 'sm' ? 12 : 14} /> : icon && renderIcon(icon)}
      {children}
      {!loading && iconRight && renderIcon(iconRight)}
    </button>
  )
)
Button.displayName = 'Button'

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconRight' | 'icon'> {
  icon: React.ReactNode
  /** Accessible name; also shown as native tooltip. */
  label: string
  shortcut?: string
}

/** Icon-only button. The label is mandatory so every icon has an accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, shortcut, variant = 'ghost', size = 'md', className = '', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={`btn-icon ${className}`}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      icon={icon}
      {...props}
    />
  )
)
IconButton.displayName = 'IconButton'
