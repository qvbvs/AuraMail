import React, { useEffect, useState, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { MessageList } from './components/MessageList'
import { Reader } from './components/Reader'
import { ContactDossier } from './components/ContactDossier'
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
import { playNotificationSound } from './utils/sound'
import { useAccountsStore } from './state/accounts-store'
import { useMailStore } from './state/mail-store'
import { useTranslation } from './i18n'

export type AppView = 'mail' | 'thread-dossier' | 'settings' | 'calendar' | 'files'

interface ComposePrefill {
  to?: string
  subject?: string
  bodyHtml?: string
}

export function App(): JSX.Element {
  const { t } = useTranslation()
  const [currentView, setCurrentView] = useState<AppView>('mail')
  const [isComposing, setIsComposing] = useState(false)
  const [composePrefill, setComposePrefill] = useState<ComposePrefill>({})
  const [statsOpen, setStatsOpen] = useState(false)
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
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

    const cleanupInbox = window.mailapp?.tray?.onGoInbox?.(() => {
      setCurrentView('mail')
      const currentFolders = useMailStore.getState().folders
      const inbox = currentFolders.find((f) => f.type === 'inbox')
      if (inbox) {
        useMailStore.getState().selectFolder(inbox.id)
      } else {
        useMailStore.getState().selectUnifiedInbox()
      }
    })

    return () => {
      cleanupCompose?.()
      cleanupSettings?.()
      cleanupInbox?.()
    }
  }, [])

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // ⌘K or Ctrl+K triggers command palette
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
        return
      }

      // ⌘, triggers settings view
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setCurrentView('settings')
        return
      }

      // Avoid single-key shortcuts when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const isEditable = (e.target as HTMLElement)?.isContentEditable
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable) {
        return
      }

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setComposePrefill({})
        setIsComposing(true)
        setCurrentView('mail')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  const isMobile = windowWidth < 768

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
  const openCompose = (prefill: ComposePrefill = {}): void => {
    setComposePrefill(prefill)
    setIsComposing(true)
    setCurrentView('mail')
    if (isMobile) setMobileActivePane('reader')
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
          ) : currentView === 'thread-dossier' ? (
            <ThreadDossierView onBackToList={() => setCurrentView('mail')} onOpenCompose={(prefill) => openCompose(prefill || {})} />
          ) : (
            <>
              <div className="pane-list" hidden={isMobile && mobileActivePane === 'reader'}>
                <MessageList onOpenThreadDossier={() => setCurrentView('thread-dossier')} />
              </div>

              <div className="pane-reader" hidden={isMobile && mobileActivePane === 'list'}>
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
      />

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
