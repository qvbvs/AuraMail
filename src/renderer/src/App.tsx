import React, { useEffect, useState, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { MessageList } from './components/MessageList'
import { Reader } from './components/Reader'
import { ContactDossier } from './components/ContactDossier'
import { ContactsView } from './components/ContactsView'
import { CommandPalette } from './components/CommandPalette'
import { ComposerPane } from './components/ComposerPane'
import { SettingsView } from './components/SettingsView'
import { ThreadDossierView } from './components/ThreadDossierView'
import { CalendarView } from './components/CalendarView'
import { FilesDriveView } from './components/FilesDriveView'
import { Topbar } from './components/Topbar'
import { StatsModal } from './components/StatsModal'
import { AddAccountDialog } from './components/AddAccountDialog'
import { OnboardingWizard } from './components/OnboardingWizard'
import { ShortcutDialog } from './components/ShortcutDialog'
import { canUsePlainShortcut, hasPrimaryModifier, hasShortcutOverlay, isTypingTarget } from './utils/keyboard'
import { playNotificationSound } from './utils/sound'
import { useAccountsStore } from './state/accounts-store'
import { useMailStore } from './state/mail-store'
import { useSchedulerStore } from './state/scheduler-store'
import { useTranslation } from './i18n'

export type AppView = 'mail' | 'thread-dossier' | 'settings' | 'calendar' | 'files' | 'contacts'

interface ComposePrefill {
  to?: string
  subject?: string
  bodyHtml?: string
}

function focusablePane(id: string): HTMLElement | undefined {
  const pane = document.getElementById(id)
  if (!pane || pane.closest('[hidden]') || pane.getClientRects().length === 0) return undefined
  return getComputedStyle(pane).visibility === 'visible' ? pane : undefined
}

function focusNextPane(backward: boolean): boolean {
  const panes = ['mail-search', 'mail-message-list', 'mail-reader'].map(focusablePane).filter((pane) => pane !== undefined)
  if (panes.length === 0) return false
  const current = panes.findIndex((pane) => pane.contains(document.activeElement))
  const next = current < 0 ? (backward ? panes.length - 1 : 0) : (current + (backward ? -1 : 1) + panes.length) % panes.length
  panes[next].focus()
  return true
}

/** Preferences chosen in onboarding (and the list sort menu) that shape the first screen. */
async function applyStartupPreferences(setView?: (v: AppView) => void): Promise<AppView> {
  const [view, sort] = await Promise.all([window.mailapp?.settings?.get('defaultView'), window.mailapp?.settings?.get('sortOrder')])
  if (sort === 'date_desc' || sort === 'date_asc' || sort === 'unread_first') useMailStore.setState({ sortOrder: sort })
  const v: AppView = view === 'calendar' || view === 'files' ? view : 'mail'
  setView?.(v)
  return v
}

export function App(): JSX.Element {
  const { t } = useTranslation()
  const [currentView, setCurrentView] = useState<AppView>('mail')
  const [isComposing, setIsComposing] = useState(false)
  const [composePrefill, setComposePrefill] = useState<ComposePrefill>({})
  const [statsOpen, setStatsOpen] = useState(false)
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [dossierOpen, setDossierOpen] = useState(window.innerWidth >= 1280)
  const [dossierWidth, setDossierWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem('dossierWidth'))
    return Number.isFinite(stored) && stored >= 280 && stored <= 640 ? stored : 384
  })

  const handleDossierWidthChange = useCallback((width: number) => {
    setDossierWidth(width)
    localStorage.setItem('dossierWidth', String(width))
  }, [])

  useEffect(() => {
    ;(window as any).__setCurrentView = setCurrentView
    ;(window as any).__setIsComposing = setIsComposing
    ;(window as any).__setShowOnboarding = setShowOnboarding
    ;(window as any).__setComposePrefill = setComposePrefill
  }, [])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1024)
  const [mobileActivePane, setMobileActivePane] = useState<'list' | 'reader'>('list')
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const isMobile = windowWidth < 768

  const openCompose = useCallback((prefill: ComposePrefill = {}): void => {
    setComposePrefill(prefill)
    setIsComposing(true)
    setCurrentView('mail')
    if (isMobile) setMobileActivePane('reader')
  }, [isMobile])

  const openInbox = useCallback((): void => {
    const mail = useMailStore.getState()
    const inbox = mail.folders.find((folder) => folder.type === 'inbox')
    setCurrentView('mail')
    setMobileActivePane('list')
    void useSchedulerStore.getState().showView('none')
    mail.setSearchQuery('')
    if (inbox && useAccountsStore.getState().selectedAccountId) void mail.selectFolder(inbox.id)
    else void mail.selectUnifiedInbox()
  }, [])

  // Onboarding Wizard state
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const { selectedMessageId } = useMailStore()

  // Sprawdź czy użytkownik przeszedł ekran pierwszej konfiguracji (onboarding)
  useEffect(() => {
    async function checkOnboarding(): Promise<void> {
      try {
        await useAccountsStore.getState().load()
        const completed = await window.mailapp?.settings?.get('onboardingCompleted')
        const currentAccounts = useAccountsStore.getState().accounts
        if (completed !== 'true' || currentAccounts.length === 0) {
          setShowOnboarding(true)
        } else {
          setShowOnboarding(false)
          setCurrentView(await applyStartupPreferences())
        }
      } catch {
        setShowOnboarding(false)
      } finally {
        setCheckingOnboarding(false)
      }
    }
    checkOnboarding()
  }, [])

  // Track window resizing for responsive behavior
  useEffect(() => {
    const handleResize = (): void => {
      setWindowWidth(window.innerWidth)
      if (window.innerWidth < 1024) setSidebarCollapsed(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-switch to reader on mobile when message is selected or composing
  useEffect(() => {
    if ((selectedMessageId || isComposing) && windowWidth < 768) {
      setMobileActivePane('reader')
    }
  }, [selectedMessageId, isComposing, windowWidth])

  // Nasłuchiwanie na zdarzenia push w czasie rzeczywistym (IMAP IDLE + Background Sync)
  useEffect(() => {
    // 1. Zwykła automatyczna synchronizacja w tle
    const cleanupAutoSync = window.mailapp?.sync?.onAutoSyncCompleted?.((results) => {
      useMailStore.getState().applyAutoSyncResults(results)
    })

    // 2. Natychmiastowe powiadomienie push o nowej wiadomości (IMAP IDLE)
    const cleanupNewMsg = window.mailapp?.sync?.onNewMessage?.((data) => {
      useMailStore.getState().onNewIncomingMessage(data)
    })

    // 3. Aktualizacja flag / stanu wiadomości (przeczytana/usunięta)
    const cleanupMsgUpd = window.mailapp?.sync?.onMessageUpdated?.(() => {
      useMailStore.getState().refreshCurrentFolder({ silent: true })
    })

    // 4. Dźwięk powiadomienia
    const cleanupSound = window.mailapp?.sync?.onSoundTriggered?.(() => {
      playNotificationSound()
    })

    // 5. Zmiana stanu połączenia w czasie rzeczywistym
    const cleanupStatus = window.mailapp?.sync?.onStatusChange?.((status) => {
      useMailStore.getState().setConnectionState(status.state)
    })

    // 6. Kliknięcie w powiadomienie systemowe / tray
    const cleanupOpenMsg = window.mailapp?.sync?.onOpenMessageFromNotification?.(async ({ accountId, messageId }) => {
      setCurrentView('mail')
      if (accountId) {
        useAccountsStore.getState().select(accountId)
        await useMailStore.getState().loadFolders(accountId)
      }
      await useMailStore.getState().selectMessage(messageId)
    })

    // 7. Wznowienie sieci po powrocie z offline
    const handleOnline = (): void => {
      window.mailapp?.sync?.notifyOnline?.()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      cleanupAutoSync?.()
      cleanupNewMsg?.()
      cleanupMsgUpd?.()
      cleanupSound?.()
      cleanupStatus?.()
      cleanupOpenMsg?.()
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // Global Tray shortcuts with proper cleanup
  useEffect(() => {
    const cleanupCompose = window.mailapp?.tray?.onComposeNew?.(() => {
      setComposePrefill({})
      setIsComposing(true)
      setCurrentView('mail')
    })

    const cleanupSettings = window.mailapp?.tray?.onOpenSettings?.(() => {
      setCurrentView('settings')
    })

    const cleanupInbox = window.mailapp?.tray?.onGoInbox?.(openInbox)

    return () => {
      cleanupCompose?.()
      cleanupSettings?.()
      cleanupInbox?.()
    }
  }, [openInbox])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (checkingOnboarding || showOnboarding || e.repeat) return
      const key = e.key.toLowerCase()

      if (hasPrimaryModifier(e) && key === 'k' && commandPaletteOpen) {
        e.preventDefault()
        setCommandPaletteOpen(false)
        return
      }
      if (hasShortcutOverlay()) return

      if (currentView === 'mail' && canUsePlainShortcut(e) && e.key === 'F6') {
        if (focusNextPane(e.shiftKey)) e.preventDefault()
        return
      }
      if (isComposing && currentView === 'mail') return

      if (hasPrimaryModifier(e) && (key === 'k' || key === ',')) {
        e.preventDefault()
        if (key === 'k') setCommandPaletteOpen(true)
        else setCurrentView('settings')
        return
      }
      if (!canUsePlainShortcut(e) || isTypingTarget(e.target)) return

      switch (key) {
        case 'c':
          if (e.shiftKey) return
          openCompose()
          break
        case '/': {
          const search = currentView === 'mail' ? focusablePane('mail-search') : undefined
          if (search) search.focus()
          else setCommandPaletteOpen(true)
          break
        }
        case 'i':
          if (!e.shiftKey) return
          openInbox()
          break
        case 's':
          if (!e.shiftKey) return
          void useMailStore.getState().syncAllAccounts()
          break
        case '?':
          setShortcutsOpen(true)
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [checkingOnboarding, showOnboarding, currentView, isComposing, commandPaletteOpen, openCompose, openInbox])

  const handleReply = useCallback((to: string, subject: string, bodyHtml?: string) => {
    setComposePrefill({ to, subject, bodyHtml: bodyHtml ?? '' })
    setIsComposing(true)
    setCurrentView('mail')
  }, [])

  const handleForward = useCallback((subject: string, bodyHtml: string) => {
    setComposePrefill({ to: '', subject, bodyHtml: `<p></p><p>${t('app.quote_fwd_prefix')}</p>${bodyHtml}` })
    setIsComposing(true)
    setCurrentView('mail')
  }, [t])

  if (checkingOnboarding) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-canvas" role="status" aria-live="polite">
        <span className="text-sm text-ink-3">{t('app.initializing')}</span>
      </div>
    )
  }

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={async () => {
          setShowOnboarding(false)
          await applyStartupPreferences(setCurrentView)
          await useAccountsStore.getState().load()
          const accs = useAccountsStore.getState().accounts
          if (accs.length > 0) {
            const defaultAcc = accs.find((a) => a.isDefault) ?? accs[0]
            useAccountsStore.getState().select(defaultAcc.id)
            await useMailStore.getState().loadFolders(defaultAcc.id, { forceInbox: true })
          }
        }}
      />
    )
  }

  const closeSidebarOnNarrow = (): void => {
    if (windowWidth < 1024) setSidebarCollapsed(true)
  }

  return (
    <div className="app-shell">
      <Topbar
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        sidebarCollapsed={sidebarCollapsed}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onGoHome={() => setCurrentView('mail')}
      />

      <div className="app-workspace">
        <div className={`pane-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <Sidebar
            currentView={currentView}
            onNavigateView={(view) => {
              setCurrentView(view)
              if (view !== 'mail') setIsComposing(false)
              closeSidebarOnNarrow()
            }}
            onOpenCompose={() => {
              openCompose()
              closeSidebarOnNarrow()
            }}
            onOpenStats={() => setStatsOpen(true)}
          />
        </div>
        {!sidebarCollapsed && windowWidth < 1024 && (
          <div className="absolute inset-0 z-30 bg-[var(--scrim)]" aria-hidden="true" onClick={() => setSidebarCollapsed(true)} />
        )}

        <main className="pane-sheet">
          {currentView === 'settings' ? (
            <SettingsView onBackToMail={() => setCurrentView('mail')} onOpenAddAccount={() => setAddAccountOpen(true)} />
          ) : currentView === 'calendar' ? (
            <CalendarView onBackToMail={() => setCurrentView('mail')} onOpenCompose={(prefill) => openCompose(prefill || {})} />
          ) : currentView === 'files' ? (
            <FilesDriveView onBackToMail={() => setCurrentView('mail')} onOpenThread={() => setCurrentView('thread-dossier')} />
          ) : currentView === 'contacts' ? (
            <ContactsView onOpenCompose={openCompose} />
          ) : currentView === 'thread-dossier' ? (
            <ThreadDossierView onBackToList={() => setCurrentView('mail')} onOpenCompose={(prefill) => openCompose(prefill || {})} />
          ) : (
            <>
              <div className="pane-list" hidden={isMobile && mobileActivePane === 'reader'}>
                <MessageList onOpenThreadDossier={() => setCurrentView('thread-dossier')} />
              </div>

              <div id="mail-reader" className="pane-reader" tabIndex={-1} hidden={isMobile && mobileActivePane === 'list'}>
                {isComposing ? (
                  <ComposerPane
                    onClose={() => {
                      setIsComposing(false)
                      if (isMobile) setMobileActivePane('list')
                    }}
                    initialTo={composePrefill.to}
                    initialSubject={composePrefill.subject}
                    initialBodyHtml={composePrefill.bodyHtml}
                  />
                ) : (
                  <>
                    <div className="flex-1 min-w-0 h-full overflow-hidden">
                      <Reader
                        onReply={handleReply}
                        onForward={handleForward}
                        onBack={() => setMobileActivePane('list')}
                        isMobile={isMobile}
                        onToggleDossier={() => setDossierOpen((prev) => !prev)}
                        isDossierOpen={dossierOpen}
                        onOpenThreadDossier={() => setCurrentView('thread-dossier')}
                      />
                    </div>
                    {dossierOpen && selectedMessageId && windowWidth >= 1280 && (
                      <ContactDossier
                        onClose={() => setDossierOpen(false)}
                        onOpenCompose={(prefill) => openCompose(prefill)}
                        width={dossierWidth}
                        onWidthChange={handleDossierWidthChange}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Command Palette (Spotlight ⌘K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenCompose={(prefill) => openCompose(prefill || {})}
        onOpenSettings={() => setCurrentView('settings')}
        onOpenStats={() => setStatsOpen(true)}
        onOpenInbox={openInbox}
        onOpenContacts={() => setCurrentView('contacts')}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenMessage={(id) => {
          setCurrentView('mail')
          if (isMobile) setMobileActivePane('reader')
          void useSchedulerStore.getState().showView('none')
          void useMailStore.getState().selectMessage(id)
        }}
      />

      <ShortcutDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Mailbox Analytics Modal */}
      <StatsModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
      />

      {/* Add Account Dialog */}
      <AddAccountDialog
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
      />
    </div>
  )
}

export default App
