import { create } from 'zustand'
import type {
  FolderSummary,
  MessageDetail,
  MessageListItem,
  AttachmentSummary,
  AttachmentDownloadResult,
  SyncResult,
  SetMessageFlagsInput,
  ConnectionState,
  LabelSummary
} from '@shared/ipc'
import { useAccountsStore } from './accounts-store'

export type MessageFilterTab = 'all' | 'unread' | 'starred' | 'attachments'
export type MessageSortOrder = 'date_desc' | 'date_asc' | 'unread_first'

interface MailState {
  folders: FolderSummary[]
  selectedFolderId: string | null
  selectedLabelId: string | null
  isUnifiedInbox: boolean
  messages: MessageListItem[]
  selectedMessageId: string | null
  selectedMessageDetail: MessageDetail | null
  selectedMessageAttachments: AttachmentSummary[]
  syncing: boolean
  loadingMessages: boolean
  loadingAttachments: boolean
  error: string | null
  syncError: string | null
  connectionState: ConnectionState
  searchQuery: string
  filterTab: MessageFilterTab
  sortOrder: MessageSortOrder
  lastSyncedAt: string | null

  loadFolders: (accountId: string, options?: { forceInbox?: boolean }) => Promise<void>
  selectFolder: (folderId: string) => Promise<void>
  selectUnifiedInbox: () => Promise<void>
  selectLabel: (labelId: string) => Promise<void>
  toggleMessageLabel: (messageId: string, label: LabelSummary) => Promise<void>
  refreshCurrentFolder: (options?: { silent?: boolean }) => Promise<void>
  onNewIncomingMessage: (data: { accountId: string; folderId: string; message: MessageListItem }) => void
  setConnectionState: (state: ConnectionState) => void
  selectMessage: (id: string) => Promise<void>
  loadMessageAttachments: (messageId: string) => Promise<void>
  downloadAttachment: (messageId: string, index: number, destDir: string) => Promise<AttachmentDownloadResult>
  syncNow: (accountId: string) => Promise<void>
  syncAllAccounts: () => Promise<void>
  applyAutoSyncResults: (results: SyncResult[]) => Promise<void>
  setMessageFlags: (id: string, flags: SetMessageFlagsInput) => Promise<void>
  togglePinned: (id: string) => Promise<void>
  moveMessage: (id: string, destFolderId: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  searchMailbox: (accountId: string, query: string) => Promise<MessageListItem[]>
  clearFolderSelection: () => void
  reset: () => void
  setSearchQuery: (query: string) => void
  setFilterTab: (tab: MessageFilterTab) => void
  setSortOrder: (order: MessageSortOrder) => void
  retryCurrentFolder: () => Promise<void>
}

export const useMailStore = create<MailState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  selectedLabelId: null,
  isUnifiedInbox: false,
  messages: [],
  selectedMessageId: null,
  selectedMessageDetail: null,
  selectedMessageAttachments: [],
  syncing: false,
  loadingMessages: false,
  loadingAttachments: false,
  error: null,
  syncError: null,
  connectionState: 'idle',
  searchQuery: '',
  filterTab: 'all',
  sortOrder: 'date_desc',
  lastSyncedAt: null,

  setConnectionState: (connectionState) => set({ connectionState }),

  loadFolders: async (accountId, options) => {
    try {
      let folders = await window.mailapp.folders.list(accountId)

      // Jeśli konto nie ma jeszcze żadnych folderów w lokalnej bazie, uruchom sync w celu ich pobrania
      if (folders.length === 0) {
        set({ syncing: true })
        try {
          await window.mailapp.sync.account(accountId)
          folders = await window.mailapp.folders.list(accountId)
        } catch {
          // ignore
        } finally {
          set({ syncing: false })
        }
      }

      set({ folders, syncError: null })
      const inbox = folders.find((f) => f.type === 'inbox') || folders[0]
      const currentFolderId = get().selectedFolderId
      const folderBelongsToAccount = folders.some((f) => f.id === currentFolderId)

      // Przejdź do skrzynki odbiorczej jeśli:
      // 1. Wymuszone przez wywołanie (np. kliknięcie konta w Sidebarze)
      // 2. Jesteśmy w widoku zbiorczym (isUnifiedInbox)
      // 3. Dotychczasowy folder nie należy do nowo załadowanego konta
      // 4. Żaden folder nie jest jeszcze zaznaczony
      const shouldSwitchToInbox =
        options?.forceInbox ||
        get().isUnifiedInbox ||
        !currentFolderId ||
        !folderBelongsToAccount

      if (shouldSwitchToInbox) {
        if (inbox) {
          await get().selectFolder(inbox.id)
        } else {
          set({
            selectedFolderId: null,
            isUnifiedInbox: false,
            messages: [],
            loadingMessages: false
          })
        }
      } else if (currentFolderId && folderBelongsToAccount) {
        await get().refreshCurrentFolder({ silent: true })
      }
    } catch (err) {
      set({ syncError: (err as Error).message })
    }
  },

  selectFolder: async (folderId) => {
    const isSameFolder = get().selectedFolderId === folderId && !get().isUnifiedInbox

    // Jeżeli klikamy ten sam folder, wykonujemy ciche odświeżenie bez czyszczenia podglądu
    if (isSameFolder) {
      await get().refreshCurrentFolder({ silent: true })
      return
    }

    set({
      selectedFolderId: folderId,
      selectedLabelId: null,
      isUnifiedInbox: false,
      loadingMessages: true,
      syncError: null,
      selectedMessageId: null,
      selectedMessageDetail: null
    })

    try {
      const messages = await window.mailapp.messages.list(folderId, 100, 0, get().sortOrder)
      // Zapisz wiadomości i wyłącz loader
      set({ messages, loadingMessages: false, syncError: null })

      // Jeśli folder w bazie jest pusty, uruchom szybki sync w tle (dla folderów typu Kosz/Archiwum/itp.)
      if (messages.length === 0) {
        const { selectedAccountId } = useAccountsStore.getState()
        if (selectedAccountId) {
          window.mailapp.sync.folder(selectedAccountId, folderId).then((res) => {
            if (res.count > 0 && get().selectedFolderId === folderId) {
              get().refreshCurrentFolder({ silent: true })
            }
          }).catch(() => {})
        }
      }
    } catch (err) {
      // WAŻNE: W razie błędu nie czyścimy istniejących wiadomości, jeśli były wcześniej załadowane
      set({ syncError: (err as Error).message, loadingMessages: false })
    }
  },

  selectUnifiedInbox: async () => {
    useAccountsStore.getState().select(null)
    set({
      selectedFolderId: 'unified',
      selectedLabelId: null,
      isUnifiedInbox: true,
      loadingMessages: true,
      syncError: null,
      selectedMessageId: null,
      selectedMessageDetail: null
    })

    try {
      const messages = await window.mailapp.messages.listUnified(100, 0, get().sortOrder)
      set({ messages, loadingMessages: false, syncError: null })
    } catch (err) {
      set({ syncError: (err as Error).message, loadingMessages: false })
    }
  },

  selectLabel: async (labelId) => {
    set({
      selectedFolderId: null,
      selectedLabelId: labelId,
      isUnifiedInbox: false,
      loadingMessages: true,
      syncError: null,
      selectedMessageId: null,
      selectedMessageDetail: null
    })

    try {
      const messages = await window.mailapp.labels.listMessages(labelId, 100, 0, get().sortOrder)
      set({ messages, loadingMessages: false, syncError: null })
    } catch (err) {
      set({ syncError: (err as Error).message, loadingMessages: false })
    }
  },

  toggleMessageLabel: async (messageId, label) => {
    const currentMessages = get().messages
    const msg = currentMessages.find((m) => m.id === messageId)
    if (!msg) return
    const hasLabel = (msg.labels || []).some((l) => l.id === label.id)

    const updatedLabels = hasLabel
      ? (msg.labels || []).filter((l) => l.id !== label.id)
      : [...(msg.labels || []), label]

    set({
      messages: currentMessages.map((m) => (m.id === messageId ? { ...m, labels: updatedLabels } : m)),
      selectedMessageDetail:
        get().selectedMessageDetail?.id === messageId
          ? { ...get().selectedMessageDetail!, labels: updatedLabels }
          : get().selectedMessageDetail
    })

    try {
      if (hasLabel) {
        await window.mailapp.labels.removeFromMessage(messageId, label.id)
      } else {
        await window.mailapp.labels.addToMessage(messageId, label.id)
      }
    } catch {
      set({ messages: currentMessages })
    }
  },

  refreshCurrentFolder: async (options = {}) => {
    const { selectedFolderId, selectedLabelId, isUnifiedInbox, sortOrder, selectedMessageId } = get()
    if (!selectedFolderId && !selectedLabelId) return

    if (!options.silent) {
      set({ loadingMessages: true })
    }

    try {
      let nextMessages: MessageListItem[]
      if (selectedLabelId) {
        nextMessages = await window.mailapp.labels.listMessages(selectedLabelId, 100, 0, sortOrder)
      } else if (isUnifiedInbox) {
        nextMessages = await window.mailapp.messages.listUnified(100, 0, sortOrder)
      } else {
        nextMessages = await window.mailapp.messages.list(selectedFolderId!, 100, 0, sortOrder)
      }

      set({ messages: nextMessages, loadingMessages: false, syncError: null })

      // Jeśli aktualnie otwarta wiadomość nadal istnieje, upewnij się że jej stan jest spójny
      if (selectedMessageId) {
        const exists = nextMessages.some((m) => m.id === selectedMessageId)
        if (!exists) {
          // wiadomość usunięta z widoku
          set({ selectedMessageId: null, selectedMessageDetail: null })
        }
      }
    } catch (err) {
      set({ syncError: (err as Error).message, loadingMessages: false })
    }
  },

  retryCurrentFolder: async () => {
    const { isUnifiedInbox, selectedFolderId, selectedLabelId } = get()
    set({ syncError: null })
    if (selectedLabelId) {
      await get().selectLabel(selectedLabelId)
    } else if (isUnifiedInbox) {
      await get().selectUnifiedInbox()
    } else if (selectedFolderId) {
      await get().selectFolder(selectedFolderId)
    }
  },

  onNewIncomingMessage: ({ accountId: _accountId, folderId, message }) => {
    const { isUnifiedInbox, selectedFolderId, messages, folders } = get()

    // 1. Zaktualizuj licznik nieprzeczytanych w sidebarze
    const nextFolders = folders.map((f) => {
      if (f.id === folderId) {
        return { ...f, unreadCount: f.unreadCount + 1 }
      }
      return f
    })
    set({ folders: nextFolders })

    // 2. Jeśli jesteśmy w skrzynce zbiorczej LUB w tym konkretnym folderze, dołącz wiadomość na szczyt
    const isTargetView = isUnifiedInbox || selectedFolderId === folderId
    if (isTargetView) {
      const alreadyExists = messages.some((m) => m.id === message.id)
      if (!alreadyExists) {
        set({ messages: [message, ...messages] })
      }
    }
  },

  selectMessage: async (id) => {
    set({ selectedMessageId: id, selectedMessageDetail: null, selectedMessageAttachments: [] })
    try {
      const detail = await window.mailapp.messages.getBody(id)
      if (get().selectedMessageId !== id) return
      set({ selectedMessageDetail: detail })
      // Pobieranie załączników w tle
      window.mailapp.messages
        .getAttachments(id)
        .then((atts) => {
          if (get().selectedMessageId === id) {
            set({ selectedMessageAttachments: atts })
          }
        })
        .catch(() => {})
    } catch (err) {
      if (get().selectedMessageId === id) {
        set({ error: (err as Error).message })
      }
    }
  },

  loadMessageAttachments: async (messageId) => {
    set({ loadingAttachments: true })
    try {
      const atts = await window.mailapp.messages.getAttachments(messageId)
      set({ selectedMessageAttachments: atts, loadingAttachments: false })
    } catch (err) {
      set({ error: (err as Error).message, loadingAttachments: false })
    }
  },

  downloadAttachment: async (messageId, index, destDir) => {
    const result = await window.mailapp.messages.downloadAttachment(messageId, index, destDir)
    const atts = await window.mailapp.messages.getAttachments(messageId)
    set({ selectedMessageAttachments: atts })
    return result
  },

  syncNow: async (accountId) => {
    set({ syncing: true, syncError: null })
    try {
      const result = await window.mailapp.sync.account(accountId)
      if (result.error) set({ syncError: result.error })
      await get().loadFolders(accountId)
      // Ciche odświeżenie bieżącego folderu z zachowaniem otwartego maila
      await get().refreshCurrentFolder({ silent: true })
      set({ lastSyncedAt: new Date().toISOString() })
    } catch (err) {
      set({ syncError: (err as Error).message })
    } finally {
      set({ syncing: false })
    }
  },

  syncAllAccounts: async () => {
    set({ syncing: true, syncError: null })
    try {
      const results = await window.mailapp.sync.allAccounts()
      const hasError = results.some((r) => r.error)
      if (hasError) {
        const errAcc = results.find((r) => r.error)
        if (errAcc) set({ syncError: `Błąd synchronizacji: ${errAcc.error}` })
      }
      const { selectedAccountId } = useAccountsStore.getState()
      if (selectedAccountId) {
        await get().loadFolders(selectedAccountId)
      }
      await get().refreshCurrentFolder({ silent: true })
      set({ lastSyncedAt: new Date().toISOString() })
    } catch (err) {
      set({ syncError: (err as Error).message })
    } finally {
      set({ syncing: false })
    }
  },

  applyAutoSyncResults: async (results) => {
    const errAcc = results.find((r) => r.error)
    if (errAcc) set({ syncError: `Błąd auto-synchronizacji: ${errAcc.error}` })
    const { selectedAccountId } = useAccountsStore.getState()
    if (selectedAccountId && results.some((r) => r.accountId === selectedAccountId)) {
      await get().loadFolders(selectedAccountId)
    }
    await get().refreshCurrentFolder({ silent: true })
    set({ lastSyncedAt: new Date().toISOString() })
  },

  setMessageFlags: async (id, flags) => {
    const prevMessages = get().messages
    const prevDetail = get().selectedMessageDetail
    const target = prevMessages.find((m) => m.id === id) || prevDetail

    // Optymistyczna aktualizacja UI
    set({
      messages: prevMessages.map((m) => (m.id === id ? { ...m, ...flags } : m)),
      selectedMessageDetail: prevDetail && prevDetail.id === id ? { ...prevDetail, ...flags } : prevDetail
    })

    // Aktualizacja lokalnego licznika unread
    if (flags.isRead !== undefined && target) {
      const delta = flags.isRead ? -1 : 1
      set({
        folders: get().folders.map((f) =>
          f.id === target.folderId ? { ...f, unreadCount: Math.max(0, f.unreadCount + delta) } : f
        )
      })
    }

    try {
      await window.mailapp.messages.setFlags(id, flags)
    } catch (err) {
      // Wycofaj zmiany w razie niepowodzenia
      set({ messages: prevMessages, selectedMessageDetail: prevDetail, syncError: (err as Error).message })
    }
  },

  togglePinned: async (id) => {
    const message = get().messages.find((m) => m.id === id) || get().selectedMessageDetail
    if (!message) return
    const nextPinned = !message.isPinned
    const prevMessages = get().messages
    set({ messages: prevMessages.map((m) => (m.id === id ? { ...m, isPinned: nextPinned } : m)) })
    try {
      await window.mailapp.messages.setPinned(id, nextPinned)
    } catch (err) {
      set({ messages: prevMessages, syncError: (err as Error).message })
    }
  },

  moveMessage: async (id, destFolderId) => {
    const movedMessage = get().messages.find((m) => m.id === id)
    try {
      await window.mailapp.messages.move(id, destFolderId)
      set({
        messages: get().messages.filter((m) => m.id !== id),
        selectedMessageId: get().selectedMessageId === id ? null : get().selectedMessageId,
        selectedMessageDetail: get().selectedMessageDetail?.id === id ? null : get().selectedMessageDetail
      })
      if (movedMessage) {
        const folders = await window.mailapp.folders.list(movedMessage.accountId)
        set({ folders })
      }
    } catch (err) {
      set({ syncError: (err as Error).message })
      throw err
    }
  },

  deleteMessage: async (id) => {
    const deletedMessage = get().messages.find((m) => m.id === id)
    try {
      await window.mailapp.messages.delete(id)
      set({
        messages: get().messages.filter((m) => m.id !== id),
        selectedMessageId: get().selectedMessageId === id ? null : get().selectedMessageId,
        selectedMessageDetail: get().selectedMessageDetail?.id === id ? null : get().selectedMessageDetail
      })
      if (deletedMessage) {
        const folders = await window.mailapp.folders.list(deletedMessage.accountId)
        set({ folders })
      }
    } catch (err) {
      set({ syncError: (err as Error).message })
      throw err
    }
  },

  searchMailbox: (accountId, query) => window.mailapp.messages.search({ accountId, query }),

  clearFolderSelection: () =>
    set({
      selectedFolderId: null,
      isUnifiedInbox: false,
      messages: [],
      selectedMessageId: null,
      selectedMessageDetail: null,
      searchQuery: '',
      syncError: null
    }),

  reset: () =>
    set({
      folders: [],
      selectedFolderId: null,
      isUnifiedInbox: false,
      messages: [],
      selectedMessageId: null,
      selectedMessageDetail: null,
      searchQuery: '',
      syncError: null
    }),

  setSearchQuery: (searchQuery: string) => set({ searchQuery }),

  setFilterTab: (filterTab: MessageFilterTab) => set({ filterTab }),

  setSortOrder: (sortOrder: MessageSortOrder) => {
    set({ sortOrder })
    get().refreshCurrentFolder()
  }
}))

if (typeof window !== 'undefined') {
  ;(window as any).__mailStore = useMailStore
}
