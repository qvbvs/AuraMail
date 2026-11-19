import React from 'react'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number
  height?: string | number
  round?: boolean
}

export function Skeleton({ width = '100%', height = 12, round = false, className = '', style, ...props }: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`skeleton ${round ? '!rounded-full' : ''} ${className}`}
      style={{ width, height, ...style }}
      {...props}
    />
  )
}
