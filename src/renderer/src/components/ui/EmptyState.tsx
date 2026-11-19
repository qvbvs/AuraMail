import React from 'react'
import { Icon } from './Button'

export interface EmptyStateProps {
  icon?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  /** Show the core keyboard shortcuts under the message (used for "no message selected"). */
  hints?: { keys: string; label: string }[]
  tone?: 'neutral' | 'danger'
}

/** Quiet, left-aligned-in-a-column empty state: an icon, a line, an optional action. */
export function EmptyState({ icon, title, description, action, className = '', hints, tone = 'neutral' }: EmptyStateProps): JSX.Element {
  return (
    <div className={`flex flex-1 items-center justify-center p-8 ${className}`}>
      <div className="w-full max-w-[300px]">
        {icon && <Icon name={icon} className={`!text-[28px] mb-3 ${tone === 'danger' ? 'text-danger' : 'text-ink-3'}`} />}
        <p className="text-md font-medium text-ink">{title}</p>
        {description && <p className="mt-1 text-sm text-ink-2 leading-relaxed">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
        {hints && hints.length > 0 && (
          <dl className="mt-6 pt-4 border-t border-line grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs text-ink-2">
            {hints.map((h) => (
              <React.Fragment key={h.keys}>
                <dt>
                  <kbd className="kbd">{h.keys}</kbd>
                </dt>
                <dd className="self-center">{h.label}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
