import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n'
import { IconButton } from './Button'

export interface ModalProps {
  open: boolean
  onClose: () => void
  onAfterClose?: () => void
  title?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
  headerExtra?: React.ReactNode
  closeOnBackdrop?: boolean
  dismissible?: boolean
  ariaLabel?: string
  /** 'center' (domyślnie) — klasyczny dialog na środku. 'drawer-right' — panel
   * wysuwany z prawej krawędzi ekranu, na całą wysokość; dla treści, które nie są
   * blokującą decyzją (np. panel podglądu/analityki), mniej inwazyjny niż modal. */
  variant?: 'center' | 'drawer-right'
}

const CLOSE_ANIMATION_MS = 130
const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex], [contenteditable="true"]'

function tabbableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
    el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible'
  )
}

/** Wspólna powłoka modali aplikacji (design tokens z components.css: .modal-overlay/
 * .modal-content/...) — zamiast każdego okna dialogowego z osobna wymyślającego swój
 * backdrop. Obsługuje ESC, klik poza treścią, blokadę przewijania body, animację
 * zamknięcia (odtwarza się przed odmontowaniem) i mieszczenie się w viewportcie z
 * przewijaniem treści (.modal-body ma overflow-y:auto, .modal-content max-height:90vh). */
export function Modal({
  open,
  onClose,
  onAfterClose,
  title,
  size = 'md',
  children,
  footer,
  headerExtra,
  closeOnBackdrop = true,
  dismissible = true,
  ariaLabel,
  variant = 'center'
}: ModalProps): JSX.Element | null {
  const { t } = useTranslation()
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const afterCloseRef = useRef(onAfterClose)
  afterCloseRef.current = onAfterClose

  const requestClose = useCallback(() => {
    if (closing || !dismissible) return
    setClosing(true)
    closeTimerRef.current = setTimeout(() => {
      onClose()
    }, CLOSE_ANIMATION_MS)
  }, [closing, dismissible, onClose])

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
      if (!contentRef.current) afterCloseRef.current?.()
    }
  }, [rendered])

  useEffect(() => {
    if (!rendered) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || (e.key !== 'Escape' && e.key !== 'Tab')) return
      const dialog = contentRef.current
      const modals = document.querySelectorAll('[aria-modal="true"]')
      if (!dialog || modals[modals.length - 1] !== dialog) return

      if (e.key === 'Escape' && !e.repeat && dismissible) {
        e.preventDefault()
        requestClose()
      }
      if (e.key === 'Tab') {
        const tabbable = tabbableElements(dialog)
        const first = tabbable[0]
        const last = tabbable[tabbable.length - 1]
        const focus = document.activeElement
        if (!first || !dialog.contains(focus) || focus === dialog || focus === (e.shiftKey ? first : last)) {
          e.preventDefault()
          const next = (e.shiftKey ? last : first) ?? dialog
          next.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rendered, requestClose, dismissible])

  useEffect(() => {
    const dialog = contentRef.current
    if (!rendered || closing || !dialog || dialog.contains(document.activeElement)) return
    const tabbable = tabbableElements(dialog)
    const firstContentControl = tabbable.find((el) => !el.hasAttribute('data-modal-close-ignore'))
    const initialFocus = firstContentControl ?? tabbable[0] ?? dialog
    initialFocus.focus()
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
        tabIndex={-1}
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
              <IconButton icon="close" label={t('common.close')} shortcut="Esc" size="sm" onClick={requestClose} disabled={!dismissible}
                data-modal-close-ignore />
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
