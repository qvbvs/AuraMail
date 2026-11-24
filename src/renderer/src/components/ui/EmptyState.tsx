import React from 'react'
import { Icon } from './Button'

export interface EmptyStateProps {
  icon?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  /** Shortcuts listed under the message; keys are space-separated ("Ctrl K"). */
  hints?: { keys: string; label: string }[]
  tone?: 'neutral' | 'danger'
}

export function EmptyState({ icon, title, description, action, className = '', hints, tone = 'neutral' }: EmptyStateProps): JSX.Element {
  return (
    <div className={`flex flex-1 items-center justify-center p-8 ${className}`}>
      <div className="w-full max-w-[360px]">
        {icon && (
          <span className={`mb-4 w-10 h-10 rounded-lg border border-line-strong flex items-center justify-center ${tone === 'danger' ? 'text-danger' : 'text-ink-2'}`}>
            <Icon name={icon} className="!text-[20px]" />
          </span>
        )}
        <p className="text-lg font-semibold text-ink">{title}</p>
        {description && <p className="mt-1.5 text-md text-ink-2 leading-relaxed">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
        {hints && hints.length > 0 && (
          <dl className="mt-6 pt-5 border-t border-line flex flex-col gap-3 text-md text-ink-2">
            {hints.map((h) => (
              <div key={h.keys} className="flex items-center justify-between gap-4">
                <dt>{h.label}</dt>
                <dd className="flex gap-1">
                  {h.keys.split(' ').map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
