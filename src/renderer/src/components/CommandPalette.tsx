import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMailStore } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useTheme } from '../theme/ThemeContext'
import { useTranslation } from '../i18n'
import { primaryModifierLabel } from '../utils/keyboard'
import { Icon } from './ui/Button'
import type { MessageListItem } from '@shared/ipc'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenCompose: (prefill?: { to?: string; subject?: string }) => void
  onOpenSettings: () => void
  onOpenStats: () => void
  onOpenInbox: () => void
  onOpenContacts: () => void
  onOpenShortcuts: () => void
  onOpenMessage: (id: string) => void
}

type Item =
  | { kind: 'command'; id: string; label: string; icon: string; shortcut?: string; run: () => void }
  | { kind: 'message'; id: string; message: MessageListItem }

const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

/** Ctrl+K: commands and full-text mail search in one keyboard-driven list. */
export function CommandPalette({
  open, onClose, onOpenCompose, onOpenSettings, onOpenStats, onOpenInbox, onOpenContacts, onOpenShortcuts, onOpenMessage
}: CommandPaletteProps): JSX.Element | null {
  const { t, formatRelativeDate } = useTranslation()
  const { toggleTheme } = useTheme()
  const { messages, syncAllAccounts, searchMailbox } = useMailStore()
  const { accounts, selectedAccountId } = useAccountsStore()
  const searchAccountId = selectedAccountId || accounts[0]?.id || null

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<MessageListItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const modifier = primaryModifierLabel()

  useEffect(() => {
    if (!open) return
    const restoreFocus = document.activeElement
    setQuery('')
    setResults(null)
    setActive(0)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected) restoreFocus.focus()
    }
  }, [open])

  // Full-text search across the mailbox (FTS5 in the main process), debounced.
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < MIN_QUERY_LENGTH || !searchAccountId) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    setResults(null)
    let activeSearch = true
    const timer = setTimeout(() => {
      searchMailbox(searchAccountId, q)
        .then((r) => activeSearch && setResults(r))
        .catch(() => activeSearch && setResults([]))
        .finally(() => activeSearch && setSearching(false))
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      activeSearch = false
      clearTimeout(timer)
    }
  }, [open, query, searchAccountId, searchMailbox])

  const close = (): void => onClose()

  const commands: Item[] = useMemo(
    () => [
      { kind: 'command', id: 'compose', label: t('commandPalette.compose_new'), icon: 'edit', shortcut: 'C', run: () => onOpenCompose() },
      { kind: 'command', id: 'inbox', label: t('commandPalette.go_inbox_folder'), icon: 'inbox', shortcut: 'Shift+I', run: onOpenInbox },
      { kind: 'command', id: 'contacts', label: t('sidebar.tool.contacts'), icon: 'contacts', run: onOpenContacts },
      { kind: 'command', id: 'sync', label: t('commandPalette.sync_now'), icon: 'sync', shortcut: 'Shift+S', run: syncAllAccounts },
      { kind: 'command', id: 'theme', label: t('topbar.toggle_theme'), icon: 'contrast', run: toggleTheme },
      { kind: 'command', id: 'stats', label: t('commandPalette.show_stats'), icon: 'monitoring', run: onOpenStats },
      { kind: 'command', id: 'settings', label: t('commandPalette.settings_integrations'), icon: 'settings', shortcut: `${modifier}+,`, run: onOpenSettings },
      { kind: 'command', id: 'shortcuts', label: t('shortcuts.title'), icon: 'keyboard', shortcut: '?', run: onOpenShortcuts }
    ],
    [t, syncAllAccounts, toggleTheme, onOpenCompose, onOpenStats, onOpenSettings, onOpenInbox, onOpenContacts, onOpenShortcuts, modifier]
  )

  const q = query.trim().toLowerCase()
  const matchedCommands = q ? commands.filter((c) => c.kind === 'command' && c.label.toLowerCase().includes(q)) : commands
  const messageSource = q.length >= MIN_QUERY_LENGTH ? results ?? [] : messages.slice(0, 6)
  const messageItems: Item[] = messageSource.slice(0, 12).map((m) => ({ kind: 'message', id: m.id, message: m }))
  const items = [...matchedCommands, ...messageItems]
  const current = Math.min(active, Math.max(0, items.length - 1))

  const runItem = (item: Item | undefined): void => {
    if (!item) return
    close()
    if (item.kind === 'command') item.run()
    else onOpenMessage(item.message.id)
  }

  if (!open) return null

  const optionId = (i: number): string => `palette-opt-${i}`
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = Math.max(0, Math.min(items.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)))
      setActive(next)
      document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && !e.repeat) runItem(items[current])
    else if (e.key === 'Escape') close()
    else if (e.key === 'Tab') inputRef.current?.focus()
    else return
    e.preventDefault()
  }

  let index = -1
  const renderOption = (item: Item): JSX.Element => {
    index += 1
    const i = index
    const selected = i === current
    return (
      <li
        key={`${item.kind}-${item.id}`}
        id={optionId(i)}
        role="option"
        aria-selected={selected}
        onMouseMove={() => setActive(i)}
        onClick={() => runItem(item)}
        className={`flex items-center gap-3 mx-2 px-3 rounded cursor-default ${item.kind === 'command' ? 'h-9' : 'py-2'} ${selected ? 'bg-selected' : ''}`}
      >
        {item.kind === 'command' ? (
          <>
            <Icon name={item.icon} className={selected ? 'text-accent' : 'text-ink-3'} />
            <span className="flex-1 text-sm text-ink">{item.label}</span>
            {item.shortcut && <kbd className="kbd">{item.shortcut}</kbd>}
          </>
        ) : (
          <>
            <Icon name={item.message.isRead ? 'drafts' : 'mail'} className={selected ? 'text-accent' : 'text-ink-3'} />
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline gap-2">
                <span className={`truncate text-sm ${item.message.isRead ? 'text-ink' : 'text-ink font-semibold'}`}>{item.message.subject || t('reader.no_subject')}</span>
                <span className="ml-auto flex-shrink-0 text-2xs text-ink-3 tabular-nums">{formatRelativeDate(item.message.dateReceived)}</span>
              </span>
              <span className="block truncate text-xs text-ink-3">
                {item.message.fromName || item.message.fromAddr}
                {item.message.snippet ? ` — ${item.message.snippet}` : ''}
              </span>
            </span>
          </>
        )}
      </li>
    )
  }

  return createPortal(
    <div className="modal-overlay !pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label={t('commandPalette.aria_label')} className="modal-content max-w-[640px] !max-h-[70vh]">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-line">
          <Icon name="search" className="text-ink-3" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items.length ? optionId(current) : undefined}
            aria-label={t('commandPalette.search_placeholder_empty')}
            className="flex-1 h-full bg-transparent text-md text-ink placeholder:text-ink-3 outline-none"
            placeholder={t('commandPalette.search_placeholder_empty')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setResults(null)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          {searching && <Icon name="progress_activity" className="text-ink-3 animate-spin" />}
          <kbd className="kbd">Esc</kbd>
        </div>

        <ul id="palette-list" role="listbox" aria-label={t('commandPalette.aria_label')} className="flex-1 overflow-y-auto py-2">
          {matchedCommands.length > 0 && (
            <li role="presentation">
              <p className="eyebrow px-5 pt-1 pb-1.5">{t('commandPalette.quick_actions_title')}</p>
              <ul role="presentation">{matchedCommands.map(renderOption)}</ul>
            </li>
          )}
          <li role="presentation" className={matchedCommands.length ? 'mt-2' : ''}>
            <p className="eyebrow px-5 pt-1 pb-1.5">{q.length >= MIN_QUERY_LENGTH ? t('commandPalette.search_results', { count: messageItems.length }) : t('commandPalette.recent_title')}</p>
            {messageItems.length > 0 ? (
              <ul role="presentation">{messageItems.map(renderOption)}</ul>
            ) : (
              <p className="px-5 py-3 text-sm text-ink-3">
                {searching ? t('commandPalette.searching') : q.length >= MIN_QUERY_LENGTH ? t('commandPalette.no_results_query') : t('commandPalette.no_messages')}
              </p>
            )}
          </li>
        </ul>

        <div className="flex items-center gap-4 px-4 h-9 border-t border-line bg-panel text-2xs text-ink-3">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            {t('commandPalette.nav_navigate')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">Enter</kbd>
            {t('commandPalette.nav_select')}
          </span>
          {q.length > 0 && q.length < MIN_QUERY_LENGTH && <span className="ml-auto">{t('commandPalette.min_chars')}</span>}
        </div>
      </div>
    </div>,
    document.body
  )
}
