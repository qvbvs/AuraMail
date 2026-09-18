import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
  pill?: boolean
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  pill = true,
  className = '',
  children,
  ...props
}: BadgeProps): JSX.Element {
  const classes = [
    'badge',
    `badge-${variant}`,
    pill ? 'badge-pill' : '',
    size === 'sm' ? 'text-xs' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  )
}
