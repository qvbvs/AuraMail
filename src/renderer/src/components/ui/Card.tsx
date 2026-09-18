import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({
  interactive = false,
  padding = 'md',
  className = '',
  style,
  children,
  ...props
}: CardProps): JSX.Element {
  const paddingStyles: Record<string, string> = {
    none: '0',
    sm: 'var(--space-4)',
    md: 'var(--space-6)',
    lg: 'var(--space-8)'
  }

  return (
    <div
      className={`card ${interactive ? 'card-interactive' : ''} ${className}`}
      style={{
        padding: paddingStyles[padding],
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  )
}
