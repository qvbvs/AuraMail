import React, { useRef, useEffect, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { useMailStore, type MessageFilterTab } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useSchedulerStore } from '../state/scheduler-store'
import { useTranslation } from '../i18n'
import { WindowControls } from './WindowControls'
import logoImg from '../assets/logo.png'

interface TopbarProps {
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
  onOpenStats: () => void
  onOpenSettings: () => void
  onOpenCommandPalette?: () => void
  onGoHome?: () => void
}

export function Topbar({
  onToggleSidebar,
  sidebarCollapsed,
  onOpenStats,
  onOpenSettings,
  onOpenCommandPalette,
  onGoHome
}: TopbarProps): JSX.Element {
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  const {
    syncing,
    syncNow,
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    folders,
    selectedFolderId
  } = useMailStore()
  const { accounts, selectedAccountId } = useAccountsStore()
  const { view: specialView, scheduled, snoozed, followUps } = useSchedulerStore()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isWindowFocused, setIsWindowFocused] = useState(true)

  const activeAccount = accounts.find((a) => a.id === selectedAccountId)

  // Listen for tray:focus-search
  useEffect(() => {
    window.mailapp?.tray?.onFocusSearch?.(() => {
      searchInputRef.current?.focus()
    })
  }, [])

  // Listen for window focus/blur
  useEffect(() => {
    const handleFocus = (): void => setIsWindowFocused(true)
    const handleBlur = (): void => setIsWindowFocused(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    const cleanup = window.mailapp?.window?.onFocusChange?.((focused) => {
      setIsWindowFocused(focused)
    })

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      cleanup?.()
    }
  }, [])

  // Determine current window title text & unread count badge
  const activeFolder = folders.find((f) => f.id === selectedFolderId)
  let windowTitleText = t('topbar.title_all_messages')
  let unreadBadgeCount = 0

  if (searchQuery.trim()) {
    windowTitleText = t('topbar.title_search', { query: searchQuery.trim() })
  } else if (specialView === 'scheduled') {
    windowTitleText = t('sidebar.folder.scheduled')
    unreadBadgeCount = scheduled.length
  } else if (specialView === 'snoozed') {
    windowTitleText = t('sidebar.folder.snoozed')
    unreadBadgeCount = snoozed.length
  } else if (specialView === 'followups') {
    windowTitleText = t('sidebar.folder.followups')
    unreadBadgeCount = followUps.length
  } else if (activeFolder) {
    windowTitleText = activeFolder.displayName
    unreadBadgeCount = activeFolder.unreadCount
  }

  // Synchronize with document.title for taskbar preview / Alt+Tab
  useEffect(() => {
    const accountPart = activeAccount?.email ? ` • ${activeAccount.email}` : ''
    const unreadPrefix = unreadBadgeCount > 0 ? `(${unreadBadgeCount}) ` : ''
    document.title = `${unreadPrefix}${windowTitleText} — AuraMail${accountPart}`
  }, [windowTitleText, unreadBadgeCount, activeAccount?.email])

  const handleSyncClick = (): void => {
    if (syncing) return
    if (selectedAccountId) {
      syncNow(selectedAccountId)
    } else if (accounts.length > 0) {
      syncNow(accounts[0].id)
    }
  }

  const handleHeaderDoubleClick = (e: React.MouseEvent): void => {
    // Ignore double-clicks on interactive controls
    if ((e.target as HTMLElement).closest('button, input, a, [role="button"], .app-no-drag')) {
      return
    }
    window.mailapp?.window?.maximize?.()
  }

  const filterOptions: { id: MessageFilterTab; label: string; icon?: string }[] = [
    { id: 'all', label: t('topbar.filter_all') },
    { id: 'unread', label: t('topbar.filter_unread') },
    { id: 'starred', label: t('topbar.filter_starred'), icon: 'star' },
    { id: 'attachments', label: t('topbar.filter_attachments'), icon: 'attachment' }
  ]

  return (
    <header
      onDoubleClick={handleHeaderDoubleClick}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className={`w-full h-14 min-h-[56px] flex-shrink-0 bg-surface-container-lowest/95 dark:bg-[#0b0f19]/95 backdrop-blur-md border-b border-border-subtle dark:border-white/[0.08] shadow-[0_1px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_12px_rgba(0,0,0,0.4)] z-40 flex items-center justify-between pl-3 sm:pl-4 pr-0 select-none app-drag-region transition-opacity duration-200 ${
        isWindowFocused ? 'opacity-100' : 'opacity-85'
      }`}
      data-testid="app-title-bar"
    >
      {/* Left: Sidebar toggle, Logo, App Brand & Window Title */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0 max-w-[280px] sm:max-w-xs md:max-w-sm xl:max-w-md">
        <button
          onClick={onToggleSidebar}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-surface-elevated text-on-surface-variant hover:text-on-surface dark:hover:text-white transition-colors app-no-drag flex-shrink-0"
          title={sidebarCollapsed ? t('topbar.toggle_sidebar_expand') : t('topbar.toggle_sidebar_collapse')}
          aria-label={t('topbar.toggle_sidebar_aria')}
        >
          <span className="material-symbols-outlined text-[20px]">
            {sidebarCollapsed ? 'menu_open' : 'menu'}
          </span>
        </button>

        {/* Brand Logo & Window Title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-2 app-no-drag hover:opacity-85 transition-opacity text-left"
            title={t('topbar.home_tooltip')}
          >
            <img
              src={logoImg}
              alt={t('topbar.logo_alt')}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-contain shadow-md shadow-indigo-500/20 flex-shrink-0"
            />

            <span className="font-headline-md text-[15px] sm:text-headline-md tracking-tight text-primary dark:text-white font-bold flex-shrink-0">
              AuraMail
            </span>
          </button>

          {/* Separator */}
          <span className="text-on-surface-variant/30 dark:text-white/20 select-none font-light text-[13px] flex-shrink-0">
            /
          </span>

          {/* Window Title & Context */}
          <div
            className="flex items-center gap-1.5 min-w-0 truncate"
            title={`${windowTitleText}${unreadBadgeCount > 0 ? ` (${t('topbar.unread_badge', { count: unreadBadgeCount })})` : ''}`}
          >
            <span className="font-title-sm text-[13px] font-semibold text-on-surface dark:text-slate-100 truncate">
              {windowTitleText}
            </span>
            {unreadBadgeCount > 0 && (
              <span className="font-label-mono text-[10px] px-1.5 py-0.5 rounded-full bg-primary-fixed dark:bg-indigo-950 text-on-primary-fixed-variant dark:text-indigo-300 font-bold flex-shrink-0 border border-transparent dark:border-indigo-800/40">
                {unreadBadgeCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Search & Quick Filters */}
      <div className="flex-1 max-w-2xl px-2 sm:px-4 flex items-center gap-space-sm min-w-0">
        <div
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="relative flex items-center flex-1 bg-surface-container-low dark:bg-surface-container-lowest/80 border border-transparent dark:border-white/[0.08] rounded-xl px-space-md py-1.5 focus-within:bg-surface-container-lowest focus-within:border-primary/50 focus-within:shadow-[0_0_0_1px_rgba(79,70,229,0.3)] transition-all app-no-drag"
        >
          <span className="material-symbols-outlined text-on-surface-variant mr-space-sm text-[18px]">
            search
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="w-full bg-transparent border-none outline-none font-body-sm text-body-sm text-on-surface dark:text-text-primary placeholder:text-on-surface-variant/70 dark:placeholder:text-text-muted"
            placeholder={t('topbar.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-on-surface-variant hover:text-on-surface p-0.5 rounded transition-colors"
              title={t('topbar.clear_search')}
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="flex items-center gap-1 font-label-mono text-caption text-on-surface-variant bg-surface-container-highest dark:bg-surface-elevated dark:border dark:border-white/[0.06] px-1.5 py-0.5 rounded hover:text-primary transition-colors cursor-pointer"
              title={t('topbar.command_palette_hint')}
            >
              <span className="text-[10px]">⌘</span>
              <span>K</span>
            </button>
          )}
        </div>

        {/* Quick filter pills */}
        <div
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="hidden xl:flex items-center gap-1 bg-surface-container-low dark:bg-surface-container-lowest/60 p-1 rounded-xl border border-transparent dark:border-white/[0.06] app-no-drag flex-shrink-0"
        >
          {filterOptions.map((opt) => {
            const isActive = filterTab === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterTab(opt.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-md text-caption transition-all ${
                  isActive
                    ? 'bg-surface-container-lowest dark:bg-surface-elevated text-primary dark:text-white shadow-sm font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface dark:hover:text-white'
                }`}
              >
                {opt.icon && <span className="material-symbols-outlined text-[13px]">{opt.icon}</span>}
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: Actions and Window Caption Controls */}
      <div className="flex items-center h-full flex-shrink-0">
        {/* Quick Toolbar Actions */}
        <div
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-3 app-no-drag"
        >
          {/* Sync Status Badge */}
          <button
            onClick={handleSyncClick}
            className={`flex items-center gap-space-xs px-2 sm:px-space-sm py-1 rounded-full transition-all ${
              syncing
                ? 'bg-primary-fixed dark:bg-indigo-950 text-primary dark:text-indigo-300'
                : 'bg-surface-container-low dark:bg-emerald-950/40 dark:border dark:border-emerald-500/30 text-on-surface-variant dark:text-emerald-300 hover:bg-surface-container'
            }`}
            title={syncing ? t('topbar.sync_in_progress') : t('topbar.click_to_sync')}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                syncing ? 'bg-primary animate-spin' : 'bg-emerald-500 animate-pulse'
              }`}
            />
            <span className="hidden sm:inline font-caption text-caption font-medium">
              {syncing ? t('topbar.syncing') : t('topbar.synced')}
            </span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            data-testid="theme-toggle"
            className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-surface-elevated text-on-surface-variant hover:text-on-surface dark:hover:text-white transition-colors"
            title={t('topbar.toggle_theme')}
          >
            <span className="material-symbols-outlined text-[20px] text-amber-500 dark:text-amber-300">
              {resolvedTheme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Analytics / Stats button */}
          <button
            onClick={onOpenStats}
            data-testid="stats-btn"
            className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-surface-elevated text-on-surface-variant hover:text-on-surface dark:hover:text-white transition-colors"
            title={t('topbar.stats')}
          >
            <span className="material-symbols-outlined text-[20px]">insights</span>
          </button>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            data-testid="settings-btn"
            className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-surface-elevated text-on-surface-variant hover:text-on-surface dark:hover:text-white transition-colors"
            title={t('topbar.settings')}
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>

          {/* Profile Card / Active Account Pill */}
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-space-sm pl-1.5 sm:pl-space-xs ml-1 border-l border-border-subtle dark:border-white/[0.08] cursor-pointer group"
            title={t('topbar.manage_account')}
          >
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-title-sm text-caption text-white font-bold shadow-sm ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0"
              style={{
                backgroundColor: activeAccount?.color || '#4f46e5'
              }}
            >
              {activeAccount?.displayName
                ? activeAccount.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : (activeAccount?.email || 'AM').slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden 2xl:flex flex-col text-left">
              <span className="font-title-sm text-caption leading-tight font-semibold text-on-surface dark:text-text-primary group-hover:text-primary transition-colors">
                {activeAccount?.displayName || 'Alex Morgan'}
              </span>
              <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted truncate max-w-[130px]">
                {activeAccount?.email || 'alex.morgan@auratech.io'}
              </span>
            </div>
          </div>
        </div>

        {/* Separator before caption buttons */}
        <div className="h-5 w-[1px] bg-border-subtle dark:border-white/[0.08] mr-0.5" />

        {/* Window Caption Buttons (Minimize, Maximize/Restore, Close) */}
        <WindowControls />
      </div>
    </header>
  )
}
