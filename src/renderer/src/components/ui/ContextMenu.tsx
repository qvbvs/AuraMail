import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: React.ReactNode | string
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  submenu?: ContextMenuItem[]
  divider?: boolean
}

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const DEFAULT_MENU_WIDTH = 220
const MENU_MARGIN = 8

export function getClampedPos(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const winH = typeof window !== 'undefined' ? window.innerHeight : 768

  let posX = x
  let posY = y

  // Poziomo: jeśli menu wykracza za prawą krawędź ekranu, otwórz je na lewo od kursora
  if (posX + width > winW - MENU_MARGIN) {
    posX = Math.max(MENU_MARGIN, posX - width)
  }
  posX = Math.max(MENU_MARGIN, Math.min(posX, winW - width - MENU_MARGIN))

  // Pionowo: jeśli menu wykracza poza dolną krawędź ekranu, otwórz je w górę
  if (posY + height > winH - MENU_MARGIN) {
    posY = Math.max(MENU_MARGIN, posY - height)
  }
  posY = Math.max(MENU_MARGIN, Math.min(posY, winH - height - MENU_MARGIN))

  return { x: posX, y: posY }
}

function MenuList({
  items,
  position,
  onClose,
  autoFocus,
  isSubmenu,
  onBack
}: {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
  autoFocus: boolean
  isSubmenu?: boolean
  onBack?: () => void
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  // Szacunkowa wysokość na start, aby uniknąć mignięcia poza ekranem przed useLayoutEffect
  const estimatedHeight = items.length * 32 + 16
  const [pos, setPos] = useState(() =>
    getClampedPos(position.x, position.y, DEFAULT_MENU_WIDTH, estimatedHeight)
  )
  const [activeIndex, setActiveIndex] = useState(-1)
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null)
  const [submenuAnchor, setSubmenuAnchor] = useState<{ x: number; y: number } | null>(null)

  const selectableIndexes = items
    .map((item, idx) => (!item.divider && !item.disabled ? idx : -1))
    .filter((idx) => idx !== -1)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(getClampedPos(position.x, position.y, rect.width || DEFAULT_MENU_WIDTH, rect.height))
  }, [position])

  useEffect(() => {
    if (autoFocus) {
      listRef.current?.focus()
    }
  }, [autoFocus])

  function moveActive(dir: 1 | -1): void {
    if (selectableIndexes.length === 0) return
    const currentPos = selectableIndexes.indexOf(activeIndex)
    const nextPos =
      currentPos === -1
        ? dir === 1
          ? 0
          : selectableIndexes.length - 1
        : (currentPos + dir + selectableIndexes.length) % selectableIndexes.length
    setActiveIndex(selectableIndexes[nextPos])
    setOpenSubmenuKey(null)
  }

  function openSubmenuForItem(item: ContextMenuItem, itemEl: HTMLElement | null): void {
    if (!item.submenu || item.submenu.length === 0) {
      setOpenSubmenuKey(null)
      return
    }
    if (itemEl) {
      const parentRect = itemEl.getBoundingClientRect()
      const winW = window.innerWidth
      const winH = window.innerHeight
      const subWidth = DEFAULT_MENU_WIDTH
      const subHeight = item.submenu.length * 32 + 16

      // Poziomo: otwórz z prawej strony elementu rodzica, a jeśli brak miejsca — z lewej
      let subX = parentRect.right - 2
      if (subX + subWidth > winW - MENU_MARGIN) {
        subX = Math.max(MENU_MARGIN, parentRect.left - subWidth + 2)
      }

      // Pionowo: wyrównaj do góry pozycji, lub podciągnij jeśli dochodzi do dołu
      let subY = parentRect.top - 4
      if (subY + subHeight > winH - MENU_MARGIN) {
        subY = Math.max(MENU_MARGIN, parentRect.bottom - subHeight + 4)
      }
      subY = Math.max(MENU_MARGIN, Math.min(subY, winH - subHeight - MENU_MARGIN))

      setSubmenuAnchor({ x: subX, y: subY })
    }
    setOpenSubmenuKey(item.key)
  }

  function activateItem(item: ContextMenuItem, itemEl: HTMLElement | null): void {
    if (item.disabled) return
    if (item.submenu && item.submenu.length > 0) {
      openSubmenuForItem(item, itemEl)
      return
    }
    item.onSelect?.()
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) {
        activateItem(item, listRef.current?.querySelector(`[data-key="${item.key}"]`) ?? null)
      }
    } else if (e.key === 'ArrowRight') {
      const item = items[activeIndex]
      if (item?.submenu) {
        e.preventDefault()
        openSubmenuForItem(item, listRef.current?.querySelector(`[data-key="${item.key}"]`) ?? null)
      }
    } else if (e.key === 'ArrowLeft') {
      if (isSubmenu && onBack) {
        e.preventDefault()
        onBack()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (isSubmenu && onBack) {
        onBack()
      } else {
        onClose()
      }
    }
  }

  return (
    <div
      ref={listRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        minWidth: DEFAULT_MENU_WIDTH,
        zIndex: 250
      }}
      className="context-menu outline-hidden"
    >
      {items.map((item, idx) =>
        item.divider ? (
          <div key={item.key || `div-${idx}`} className="context-menu-divider" role="separator" />
        ) : (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={(e) => {
              setActiveIndex(idx)
              if (item.submenu && item.submenu.length > 0) {
                openSubmenuForItem(item, e.currentTarget)
              } else {
                setOpenSubmenuKey(null)
              }
            }}
            onClick={(e) => activateItem(item, e.currentTarget)}
            className={`context-menu-item group ${idx === activeIndex ? 'is-active' : ''} ${
              item.danger ? 'is-danger' : ''
            }`}
          >
            {item.icon && (
              <span className="context-menu-icon flex items-center justify-center w-4 h-4 shrink-0 leading-none">
                {typeof item.icon === 'string' ? (
                  <span className="material-symbols-outlined text-[16px] select-none leading-none">
                    {item.icon}
                  </span>
                ) : (
                  item.icon
                )}
              </span>
            )}
            <span className="flex-1 text-left truncate leading-none">{item.label}</span>
            {item.submenu && (
              <svg
                className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform ml-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        )
      )}

      {openSubmenuKey &&
        submenuAnchor &&
        (() => {
          const parent = items.find((i) => i.key === openSubmenuKey)
          if (!parent?.submenu) return null
          // Portal osobno do document.body: rodzic ma `backdrop-filter`, co tworzy
          // nowy containing block dla `position: fixed` potomków (jak `transform`).
          // Zagnieżdżony fixed-div liczyłby się względem rodzica zamiast viewportu
          // i wylatywał poza ekran — stąd submenu "nie pokazywało się".
          return createPortal(
            <MenuList
              items={parent.submenu}
              position={submenuAnchor}
              onClose={onClose}
              autoFocus={false}
              isSubmenu={true}
              onBack={() => {
                setOpenSubmenuKey(null)
                listRef.current?.focus()
              }}
            />,
            document.body
          )
        })()}
    </div>
  )
}

/** Ogólne menu kontekstowe (PPM) — pozycjonowane w miejscu kliknięcia, przycięte do
 * viewportu, nawigowalne klawiaturą (↑↓ Enter Esc, →/← dla podmenu), zamyka się przy
 * kliknięciu poza sobą, scrollu lub Esc. Renderowane portalem, żeby nie było ucinane
 * przez `overflow` rodzica. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('.context-menu')) onClose()
    }
    const handleScroll = (): void => onClose()
    const handleResize = (): void => onClose()
    document.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [onClose])

  return createPortal(
    <MenuList items={items} position={{ x, y }} onClose={onClose} autoFocus={true} />,
    document.body
  )
}
