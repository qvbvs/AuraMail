import { create } from 'zustand'
import type { AccountSummary, CreateAccountInput } from '@shared/ipc'

interface AccountsState {
  accounts: AccountSummary[]
  selectedAccountId: string | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  create: (input: CreateAccountInput) => Promise<AccountSummary>
  remove: (id: string) => Promise<void>
  select: (id: string | null) => void
  setDefault: (id: string) => Promise<void>
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const accounts = await window.mailapp.accounts.list()
      set({ accounts, loading: false })
      if (get().selectedAccountId === null && accounts.length > 0) {
        const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0]
        set({ selectedAccountId: defaultAccount.id })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  create: async (input) => {
    set({ error: null })
    try {
      const account = await window.mailapp.accounts.create(input)
      set({ accounts: [...get().accounts, account] })
      return account
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  remove: async (id) => {
    await window.mailapp.accounts.delete(id)
    set({ accounts: get().accounts.filter((a) => a.id !== id) })
    // If selected account was deleted, clear selection
    if (get().selectedAccountId === id) {
      set({ selectedAccountId: null })
    }
  },

  select: (id) => set({ selectedAccountId: id }),

  setDefault: async (id) => {
    await window.mailapp.accounts.setDefault(id)
    set({ accounts: get().accounts.map((a) => ({ ...a, isDefault: a.id === id })) })
  }
}))

if (typeof window !== 'undefined') {
  ;(window as any).__accountsStore = useAccountsStore
}

