import React, { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'

export function WindowControls(): JSX.Element {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Initial state check
    window.mailapp?.window?.isMaximized?.().then((max) => {
      setIsMaximized(max)
    })

    // Listen for maximize / unmaximize events from main process
    const cleanup = window.mailapp?.window?.onMaximizeChange?.((max) => {
      setIsMaximized(max)
    })

    return () => {
      cleanup?.()
    }
  }, [])

  const handleMinimize = (): void => {
    window.mailapp?.window?.minimize?.()
  }

  const handleMaximize = (): void => {
    window.mailapp?.window?.maximize?.().then((max) => {
      setIsMaximized(max)
    })
  }

  const handleClose = (): void => {
    window.mailapp?.window?.close?.()
  }

  return (
    <div
      className="flex items-center h-full flex-shrink-0 select-none app-no-drag"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      data-testid="window-caption-buttons"
    >
      {/* Minimize Button */}
      <button
        type="button"
        onClick={handleMinimize}
        title={t('window.minimize')}
        aria-label={t('window.minimize')}
        className="w-[46px] h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:bg-black/[0.1] dark:active:bg-white/[0.12] transition-colors duration-150 outline-none focus-visible:bg-black/[0.05] dark:focus-visible:bg-white/[0.08]"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none"
        >
          <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </button>

      {/* Maximize / Restore Button */}
      <button
        type="button"
        onClick={handleMaximize}
        title={isMaximized ? t('window.restore') : t('window.maximize')}
        aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
        className="w-[46px] h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:bg-black/[0.1] dark:active:bg-white/[0.12] transition-colors duration-150 outline-none focus-visible:bg-black/[0.05] dark:focus-visible:bg-white/[0.08]"
      >
        {isMaximized ? (
          /* Restore Icon (Two overlapping rectangles, Windows 11 style) */
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="pointer-events-none"
          >
            {/* Background window */}
            <path
              d="M3.5 2.2H8.8C9.3 2.2 9.8 2.7 9.8 3.2V8.5"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            {/* Foreground window */}
            <rect
              x="1.2"
              y="3.2"
              width="6.6"
              height="6.6"
              rx="1.2"
              stroke="currentColor"
              strokeWidth="1.1"
            />
          </svg>
        ) : (
          /* Maximize Icon (Single rectangle, rounded subtle corners) */
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="pointer-events-none"
          >
            <rect
              x="1.5"
              y="1.5"
              width="8"
              height="8"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.1"
            />
          </svg>
        )}
      </button>

      {/* Close Button */}
      <button
        type="button"
        onClick={handleClose}
        title={t('window.close')}
        aria-label={t('window.close')}
        className="w-[46px] h-full flex items-center justify-center text-on-surface-variant hover:text-white dark:text-slate-400 dark:hover:text-white hover:bg-[#e81123] active:bg-[#c42b1c] dark:hover:bg-[#e81123] dark:active:bg-[#b82216] transition-colors duration-150 outline-none focus-visible:bg-[#e81123] focus-visible:text-white"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none"
        >
          <path
            d="M2 2L9 9M9 2L2 9"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
