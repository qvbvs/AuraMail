import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
  headerExtra?: React.ReactNode
  closeOnBackdrop?: boolean
  ariaLabel?: string
  /** 'center' (domyślnie) — klasyczny dialog na środku. 'drawer-right' — panel
   * wysuwany z prawej krawędzi ekranu, na całą wysokość; dla treści, które nie są
   * blokującą decyzją (np. panel podglądu/analityki), mniej inwazyjny niż modal. */
  variant?: 'center' | 'drawer-right'
}

const CLOSE_ANIMATION_MS = 130

/** Wspólna powłoka modali aplikacji (design tokens z components.css: .modal-overlay/
 * .modal-content/...) — zamiast każdego okna dialogowego z osobna wymyślającego swój
 * backdrop. Obsługuje ESC, klik poza treścią, blokadę przewijania body, animację
 * zamknięcia (odtwarza się przed odmontowaniem) i mieszczenie się w viewportcie z
 * przewijaniem treści (.modal-body ma overflow-y:auto, .modal-content max-height:90vh). */
export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  headerExtra,
  closeOnBackdrop = true,
  ariaLabel,
  variant = 'center'
}: ModalProps): JSX.Element | null {
  const { t } = useTranslation()
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const requestClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = setTimeout(() => {
      onClose()
    }, CLOSE_ANIMATION_MS)
  }, [closing, onClose])

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
    } else if (rendered) {
      // Zamknięcie wywołane z zewnątrz (np. inna akcja) — pomiń animację, po prostu odmontuj.
      setRendered(false)
      setClosing(false)
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!rendered) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [rendered])

  useEffect(() => {
    if (!rendered) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rendered, requestClose])

  useEffect(() => {
    if (rendered && !closing) {
      // Autofocus pierwszego interaktywnego elementu — wygodne dla klawiatury, bez
      // walki o dokładny "focus trap" (Esc + klik poza wystarcza do wyjścia).
      const el = contentRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-modal-close-ignore])'
      )
      el?.focus()
    }
  }, [rendered, closing])

  if (!rendered) return null

  return createPortal(
    <div
      className={`modal-overlay${variant === 'drawer-right' ? ' modal-overlay--drawer' : ''}${closing ? ' is-closing' : ''}`}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : undefined)}
        className={
          variant === 'drawer-right' ? 'modal-content modal-content--drawer' : `modal-content modal-content--${size}`
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || headerExtra) && (
          <div className="modal-header">
            {title && <h2 className="modal-title">{title}</h2>}
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerExtra}
              <button
                type="button"
                onClick={requestClose}
                className="modal-close-btn"
                aria-label={t('common.close')}
                title={`${t('common.close')} (Esc)`}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>
        )}

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
