import React, { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'

const glyph = { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true } as const
const base =
  'w-[46px] h-full flex items-center justify-center text-ink-2 transition-colors outline-none focus-visible:bg-hover'

/** Windows-style caption buttons for the frameless window. */
export function WindowControls(): JSX.Element {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.mailapp?.window?.isMaximized?.().then(setIsMaximized)
    const cleanup = window.mailapp?.window?.onMaximizeChange?.(setIsMaximized)
    return () => cleanup?.()
  }, [])

  const maxLabel = isMaximized ? t('window.restore') : t('window.maximize')

  return (
    <div className="flex h-full flex-shrink-0 app-no-drag" data-testid="window-caption-buttons">
      <button type="button" onClick={() => window.mailapp?.window?.minimize?.()} title={t('window.minimize')} aria-label={t('window.minimize')} className={`${base} hover:bg-hover hover:text-ink`}>
        <svg {...glyph}>
          <path d="M0 5h10" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => window.mailapp?.window?.maximize?.().then(setIsMaximized)}
        title={maxLabel}
        aria-label={maxLabel}
        className={`${base} hover:bg-hover hover:text-ink`}
      >
        {isMaximized ? (
          <svg {...glyph}>
            <path d="M2.5 2.5V.5h7v7h-2" />
            <rect x=".5" y="2.5" width="7" height="7" />
          </svg>
        ) : (
          <svg {...glyph}>
            <rect x=".5" y=".5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button type="button" onClick={() => window.mailapp?.window?.close?.()} title={t('window.close')} aria-label={t('window.close')} className={`${base} hover:bg-[#c42b1c] hover:text-white focus-visible:bg-[#c42b1c] focus-visible:text-white`}>
        <svg {...glyph}>
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  )
}
