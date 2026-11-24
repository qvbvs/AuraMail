import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { useMailStore } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useSchedulerStore } from '../state/scheduler-store'
import { useTranslation } from '../i18n'
import { WindowControls } from './WindowControls'
import { Brand } from './Brand'
import { Icon, IconButton } from './ui/Button'
import { primaryModifierLabel } from '../utils/keyboard'

interface TopbarProps {
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
  onOpenCommandPalette?: () => void
  onGoHome?: () => void
}

/** Frameless title bar: navigation toggle, brand, global search, theme, caption buttons. */
export function Topbar({ onToggleSidebar, sidebarCollapsed, onOpenCommandPalette, onGoHome }: TopbarProps): JSX.Element {
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery, folders, selectedFolderId } = useMailStore()
  const { accounts, selectedAccountId } = useAccountsStore()
  const { view: specialView } = useSchedulerStore()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(true)
  const modifier = primaryModifierLabel()

  useEffect(() => window.mailapp?.tray?.onFocusSearch?.(() => searchInputRef.current?.focus()), [])

  useEffect(() => {
    const on = (): void => setFocused(true)
    const off = (): void => setFocused(false)
    window.addEventListener('focus', on)
    window.addEventListener('blur', off)
    const cleanup = window.mailapp?.window?.onFocusChange?.(setFocused)
    return () => {
      window.removeEventListener('focus', on)
      window.removeEventListener('blur', off)
      cleanup?.()
    }
  }, [])

  // Keep the OS window title meaningful for the taskbar / Alt+Tab.
  const activeAccount = accounts.find((a) => a.id === selectedAccountId)
  const activeFolder = folders.find((f) => f.id === selectedFolderId)
  useEffect(() => {
    let title = t('topbar.title_all_messages')
    let unread = 0
    if (searchQuery.trim()) title = t('topbar.title_search', { query: searchQuery.trim() })
    else if (specialView === 'scheduled') title = t('sidebar.folder.scheduled')
    else if (specialView === 'snoozed') title = t('sidebar.folder.snoozed')
    else if (specialView === 'followups') title = t('sidebar.folder.followups')
    else if (activeFolder) {
      title = activeFolder.displayName
      unread = activeFolder.unreadCount
    }
    document.title = `${unread > 0 ? `(${unread}) ` : ''}${title} — AuraMail${activeAccount?.email ? ` — ${activeAccount.email}` : ''}`
  }, [t, searchQuery, specialView, activeFolder, activeAccount?.email])

  return (
    <header
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, input, a, .app-no-drag')) window.mailapp?.window?.maximize?.()
      }}
      className={`app-drag-region h-[var(--titlebar-h)] grid grid-cols-[minmax(0,1fr)_minmax(0,720px)_minmax(0,1fr)] max-sm:grid-cols-[auto_1fr_auto] items-center gap-3 pl-2 bg-canvas transition-opacity ${focused ? '' : 'opacity-80'}`}
      data-testid="app-title-bar"
    >
      <div className="flex items-center gap-1 min-w-0">
        <IconButton
          className="app-no-drag"
          icon={sidebarCollapsed ? 'left_panel_open' : 'left_panel_close'}
          label={sidebarCollapsed ? t('topbar.toggle_sidebar_expand') : t('topbar.toggle_sidebar_collapse')}
          onClick={onToggleSidebar}
        />
        <button type="button" onClick={onGoHome} title={t('topbar.home_tooltip')} className="app-no-drag flex items-baseline gap-1 px-1.5 rounded hover:bg-hover h-7">
          <Brand />
        </button>
      </div>

      <div className="app-no-drag min-w-0 max-sm:invisible">
        <label className="relative flex items-center h-[34px] rounded-lg border border-line bg-panel hover:border-line-strong focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_var(--hover)] transition-shadow">
          <Icon name="search" className="absolute left-3 text-ink-3 pointer-events-none" />
          <span className="sr-only">{t('common.search')}</span>
          <input
            id="mail-search"
            ref={searchInputRef}
            type="search"
            className="w-full h-full bg-transparent pl-9 pr-20 text-md text-ink placeholder:text-ink-3 outline-none [&::-webkit-search-cancel-button]:hidden"
            placeholder={t('topbar.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setSearchQuery('')
                searchInputRef.current?.blur()
              }
            }}
          />
          <span className="absolute right-1.5 flex items-center gap-1">
            {searchQuery ? (
              <IconButton icon="close" label={t('topbar.clear_search')} size="xs" onClick={() => setSearchQuery('')} />
            ) : (
              <button type="button" onClick={onOpenCommandPalette} title={t('topbar.command_palette_hint', { modifier })} className="flex gap-0.5">
                <kbd className="kbd">{modifier}</kbd>
                <kbd className="kbd">K</kbd>
              </button>
            )}
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end h-full app-no-drag">
        <IconButton icon="search" label={t('common.search')} shortcut={`${modifier}+K`} onClick={onOpenCommandPalette} className="sm:hidden" />
        <IconButton
          icon={resolvedTheme === 'dark' ? 'light_mode' : 'dark_mode'}
          label={t('topbar.toggle_theme')}
          onClick={toggleTheme}
          data-testid="theme-toggle"
          className="mr-2"
        />
        <WindowControls />
      </div>
    </header>
  )
}
