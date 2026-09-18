import React from 'react'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'title' | 'avatar' | 'rect'
  width?: string | number
  height?: string | number
  borderRadius?: string | number
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  borderRadius,
  className = '',
  style,
  ...props
}: SkeletonProps): JSX.Element {
  let defaultClass = 'skeleton'
  if (variant === 'text') defaultClass += ' skeleton-text'
  if (variant === 'title') defaultClass += ' skeleton-title'
  if (variant === 'avatar') defaultClass += ' skeleton-avatar'

  return (
    <div
      className={`${defaultClass} ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style
      }}
      {...props}
    />
  )
}
