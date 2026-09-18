import React from 'react'
import { useTranslation } from '../../i18n'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'inbox-zero'
  showShortcuts?: boolean
}

export function InboxZeroIllustration({ className = 'w-48 h-36' }: { className?: string }): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" fill="none" className={`max-w-full ${className}`}>
      <defs>
        <linearGradient id="glow" x1="200" y1="50" x2="200" y2="250" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F46E5" stopOpacity="0.18" />
          <stop stopColor="#EEF2FF" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="cardGradLight" x1="120" y1="90" x2="280" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop stopColor="#F8FAFC" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="160" y1="120" x2="240" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F46E5" />
          <stop stopColor="#6366F1" />
        </linearGradient>
        <filter id="shadow" x="90" y="80" width="220" height="150" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="12" stdDeviation="16" floodColor="#1E1B4B" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* Ambient Glow & Halo */}
      <circle cx="200" cy="150" r="120" fill="url(#glow)" />
      <circle cx="200" cy="150" r="75" stroke="#818CF8" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 6" />

      {/* Orbiting sparkle elements */}
      <circle cx="120" cy="80" r="4" fill="#818CF8" />
      <circle cx="290" cy="110" r="5" fill="#C7D2FE" />
      <path d="M280 75L282 82L289 84L282 86L280 93L278 86L271 84L278 82Z" fill="#6366F1" />
      <path d="M105 195L106.5 201L112.5 202.5L106.5 204L105 210L103.5 204L97.5 202.5L103.5 201Z" fill="#A5B4FC" />

      {/* Back Floating Layer (Card behind) */}
      <rect x="130" y="105" width="140" height="88" rx="16" fill="#EEF2FF" className="dark:fill-indigo-950/60" transform="rotate(-6 200 149)" />

      {/* Main Central Inbox Card with Drop Shadow */}
      <g filter="url(#shadow)">
        <rect
          x="125"
          y="95"
          width="150"
          height="96"
          rx="16"
          className="fill-white dark:fill-slate-800 stroke-slate-200 dark:stroke-slate-700"
          strokeWidth="1.5"
        />
        {/* Tray opening curve */}
        <path
          d="M125 155C148 155 152 168 175 168H225C248 168 252 155 275 155"
          stroke="#CBD5E1"
          className="dark:stroke-slate-600"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Checkmark Badge in center */}
        <circle cx="200" cy="132" r="26" fill="url(#accentGrad)" />
        <path d="M191 132L197 138L209 126" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Green / Active dot badge */}
      <circle cx="260" cy="105" r="8" fill="#10B981" />
      <path d="M257 105L259 107L263 103" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Clean Base Accent Bar */}
      <rect x="160" y="218" width="80" height="5" rx="2.5" fill="#E2E8F0" className="dark:fill-slate-700" />
    </svg>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  style,
  variant = 'default',
  showShortcuts = false
}: EmptyStateProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center select-none ${className}`}
      style={style}
    >
      <div className="max-w-md flex flex-col items-center">
        {variant === 'inbox-zero' ? (
          <div className="mb-4 flex items-center justify-center">
            <InboxZeroIllustration />
          </div>
        ) : icon ? (
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 shadow-sm border border-indigo-100 dark:border-indigo-900/30">
            {icon}
          </div>
        ) : null}

        <h3 className="text-xl font-bold font-headline text-slate-800 dark:text-slate-100 mb-1.5">
          {title}
        </h3>

        {description && (
          <p className="text-sm font-normal text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {description}
          </p>
        )}

        {action && <div className="mb-4">{action}</div>}

        {showShortcuts && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-center gap-6 text-xs text-slate-400 dark:text-slate-500 font-mono">
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-semibold text-slate-700 dark:text-slate-300 shadow-xs border border-slate-200 dark:border-slate-700">C</kbd>
              <span>{t('emptyState.new_message')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-semibold text-slate-700 dark:text-slate-300 shadow-xs border border-slate-200 dark:border-slate-700">⌘K</kbd>
              <span>{t('emptyState.search')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-semibold text-slate-700 dark:text-slate-300 shadow-xs border border-slate-200 dark:border-slate-700">?</kbd>
              <span>{t('emptyState.shortcuts')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
