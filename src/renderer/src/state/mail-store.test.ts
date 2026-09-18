import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMailStore } from './mail-store'
import type { MessageDetail } from '@shared/ipc'

describe('useMailStore - Flags and Selection', () => {
  const mockMailApp = {
    messages: {
      setFlags: vi.fn().mockResolvedValue(undefined),
      setPinned: vi.fn().mockResolvedValue(undefined),
      getBody: vi.fn(),
      getAttachments: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      listUnified: vi.fn().mockResolvedValue([])
    },
    folders: {
      list: vi.fn().mockResolvedValue([]),
    },
    sync: {
      account: vi.fn().mockResolvedValue({ accountId: 'acc-1', newMessages: 0, status: 'active', error: null }),
      allAccounts: vi.fn().mockResolvedValue([]),
      folder: vi.fn().mockResolvedValue({ count: 0 })
    }
  }

  beforeEach(() => {
    ;(global as any).window = { mailapp: mockMailApp }
    vi.clearAllMocks()
    useMailStore.setState({
      messages: [
        {
          id: 'msg-1',
          accountId: 'acc-1',
          folderId: 'f-1',
          threadId: null,
          subject: 'Test email 1',
          fromAddr: 'sender@example.com',
          fromName: 'Sender',
          snippet: 'Snippet 1',
          dateReceived: '2026-09-17T12:00:00Z',
          isRead: false,
          isStarred: false,
          isImportant: false,
          isPinned: false,
          hasAttachments: false,
          threadCount: 1
        },
        {
          id: 'msg-2',
          accountId: 'acc-1',
          folderId: 'f-1',
          threadId: null,
          subject: 'Test email 2',
          fromAddr: 'sender2@example.com',
          fromName: 'Sender 2',
          snippet: 'Snippet 2',
          dateReceived: '2026-09-17T13:00:00Z',
          isRead: true,
          isStarred: true,
          isImportant: false,
          isPinned: false,
          hasAttachments: false,
          threadCount: 1
        }
      ],
      selectedMessageId: null,
      selectedMessageDetail: null
    })
  })

  it('marks message as read optimistically and calls backend', async () => {
    const store = useMailStore.getState()
    await store.setMessageFlags('msg-1', { isRead: true })

    const updated = useMailStore.getState().messages.find((m) => m.id === 'msg-1')
    expect(updated?.isRead).toBe(true)
    expect(mockMailApp.messages.setFlags).toHaveBeenCalledWith('msg-1', { isRead: true })
  })

  it('toggles starred flag optimistically and calls backend', async () => {
    const store = useMailStore.getState()
    // Star msg-1
    await store.setMessageFlags('msg-1', { isStarred: true })
    expect(useMailStore.getState().messages.find((m) => m.id === 'msg-1')?.isStarred).toBe(true)
    expect(mockMailApp.messages.setFlags).toHaveBeenCalledWith('msg-1', { isStarred: true })

    // Unstar msg-2
    await store.setMessageFlags('msg-2', { isStarred: false })
    expect(useMailStore.getState().messages.find((m) => m.id === 'msg-2')?.isStarred).toBe(false)
    expect(mockMailApp.messages.setFlags).toHaveBeenCalledWith('msg-2', { isStarred: false })
  })

  it('selectMessage loads detail and updates selectedMessageId', async () => {
    const mockDetail: MessageDetail = {
      id: 'msg-1',
      accountId: 'acc-1',
      folderId: 'f-1',
      threadId: null,
      subject: 'Test email 1',
      fromAddr: 'sender@example.com',
      fromName: 'Sender',
      snippet: 'Snippet 1',
      dateReceived: '2026-09-17T12:00:00Z',
      isRead: false,
      isStarred: false,
      isImportant: false,
      isPinned: false,
      hasAttachments: false,
      threadCount: 1,
      toJson: '[]',
      ccJson: '[]',
      bccJson: '[]',
      bodyHtml: '<p>Hello world</p>',
      bodyPlain: 'Hello world'
    }
    mockMailApp.messages.getBody.mockResolvedValueOnce(mockDetail)

    const store = useMailStore.getState()
    await store.selectMessage('msg-1')

    expect(useMailStore.getState().selectedMessageId).toBe('msg-1')
    expect(useMailStore.getState().selectedMessageDetail).toEqual(mockDetail)
  })

  it('toggles pinned status correctly', async () => {
    const store = useMailStore.getState()
    await store.togglePinned('msg-1')

    expect(useMailStore.getState().messages.find((m) => m.id === 'msg-1')?.isPinned).toBe(true)
    expect(mockMailApp.messages.setPinned).toHaveBeenCalledWith('msg-1', true)
  })

  it('prepends new message on incoming push notification without wiping store', () => {
    const store = useMailStore.getState()
    useMailStore.setState({ selectedFolderId: 'f-1', isUnifiedInbox: false })

    store.onNewIncomingMessage({
      accountId: 'acc-1',
      folderId: 'f-1',
      message: {
        id: 'msg-new',
        accountId: 'acc-1',
        folderId: 'f-1',
        threadId: null,
        subject: 'Brand new email',
        fromAddr: 'boss@example.com',
        fromName: 'Boss',
        snippet: 'Important announcement',
        dateReceived: '2026-09-17T14:00:00Z',
        isRead: false,
        isStarred: false,
        isImportant: true,
        isPinned: false,
        hasAttachments: false,
        threadCount: 1
      }
    })

    const state = useMailStore.getState()
    expect(state.messages.length).toBe(3)
    expect(state.messages[0].id).toBe('msg-new')
  })

  it('retains existing messages when selectFolder encounters an error', async () => {
    mockMailApp.messages.list.mockRejectedValueOnce(new Error('Connection lost'))
    const initialMessages = useMailStore.getState().messages

    const store = useMailStore.getState()
    await store.selectFolder('f-error')

    const state = useMailStore.getState()
    expect(state.syncError).toBe('Connection lost')
    expect(state.loadingMessages).toBe(false)
    // Messages are NOT overwritten by []
    expect(state.messages.length).toBe(initialMessages.length)
  })

  it('switches out of unified inbox and selects the account inbox', async () => {
    mockMailApp.folders.list.mockResolvedValueOnce([
      { id: 'f-inbox-acc1', accountId: 'acc-1', displayName: 'Odebrane', type: 'inbox', unreadCount: 2 }
    ])
    mockMailApp.messages.list.mockResolvedValueOnce([
      { id: 'msg-acc1', accountId: 'acc-1', folderId: 'f-inbox-acc1', threadId: null, subject: 'Acc 1 mail', fromAddr: 'a@b.com', fromName: 'A', snippet: '', dateReceived: '2026-09-17T15:00:00Z', isRead: false, isStarred: false, isImportant: false, isPinned: false, hasAttachments: false, threadCount: 1 }
    ])

    // Set store in Unified Inbox state
    useMailStore.setState({ isUnifiedInbox: true, selectedFolderId: 'unified' })

    const store = useMailStore.getState()
    await store.loadFolders('acc-1', { forceInbox: true })

    const state = useMailStore.getState()
    expect(state.isUnifiedInbox).toBe(false)
    expect(state.selectedFolderId).toBe('f-inbox-acc1')
    expect(state.messages.length).toBe(1)
    expect(state.messages[0].id).toBe('msg-acc1')
  })

  it('switches between accounts and selects new account inbox when previous folder does not belong to new account', async () => {
    // Current state: Account 1's folder is selected
    useMailStore.setState({
      isUnifiedInbox: false,
      selectedFolderId: 'f-inbox-acc1',
      folders: [{ id: 'f-inbox-acc1', accountId: 'acc-1', displayName: 'Odebrane', type: 'inbox', unreadCount: 0 }]
    })

    // Account 2 has a different inbox
    mockMailApp.folders.list.mockResolvedValueOnce([
      { id: 'f-inbox-gmail', accountId: 'acc-gmail', displayName: 'Odebrane', type: 'inbox', unreadCount: 5 }
    ])
    mockMailApp.messages.list.mockResolvedValueOnce([
      { id: 'msg-gmail-1', accountId: 'acc-gmail', folderId: 'f-inbox-gmail', threadId: null, subject: 'Gmail mail', fromAddr: 'g@gmail.com', fromName: 'Gmail User', snippet: '', dateReceived: '2026-09-17T16:00:00Z', isRead: false, isStarred: false, isImportant: false, isPinned: false, hasAttachments: false, threadCount: 1 }
    ])

    const store = useMailStore.getState()
    await store.loadFolders('acc-gmail')

    const state = useMailStore.getState()
    expect(state.selectedFolderId).toBe('f-inbox-gmail')
    expect(state.messages.length).toBe(1)
    expect(state.messages[0].subject).toBe('Gmail mail')
  })

  it('triggers account sync if folders list is empty upon loadFolders', async () => {
    // First call returns empty, then after sync returns folders
    mockMailApp.folders.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'f-inbox-new', accountId: 'acc-new', displayName: 'Odebrane', type: 'inbox', unreadCount: 0 }
      ])
    mockMailApp.messages.list.mockResolvedValueOnce([])

    const store = useMailStore.getState()
    await store.loadFolders('acc-new')

    expect(mockMailApp.sync.account).toHaveBeenCalledWith('acc-new')
    const state = useMailStore.getState()
    expect(state.selectedFolderId).toBe('f-inbox-new')
  })
})
