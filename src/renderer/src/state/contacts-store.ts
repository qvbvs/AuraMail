import { create } from 'zustand'
import type { ContactSummary, SaveContactInput, SaveContactResult } from '@shared/ipc'

interface ContactsState {
  contacts: ContactSummary[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  load: () => Promise<void>
  save: (input: SaveContactInput) => Promise<SaveContactResult>
  remove: (id: string) => Promise<void>
}

export const useContactsStore = create<ContactsState>((set, get) => {
  let pendingLoad: Promise<void> | null = null

  return {
    contacts: [],
    status: 'idle',
    load: async () => {
      if (get().status === 'ready') return
      if (!pendingLoad) {
        pendingLoad = Promise.resolve()
          .then(() => window.mailapp.contacts.list())
          .then((contacts) => set({ contacts, status: 'ready' }))
          .catch(() => set({ status: 'error' }))
          .finally(() => { pendingLoad = null })
        set({ status: 'loading' })
      }
      await pendingLoad
    },
    save: async (input) => {
      await get().load()
      const result = await window.mailapp.contacts.save(input)
      if (result.ok) {
        set(({ contacts }) => ({ contacts: [...contacts.filter((contact) => contact.id !== result.contact.id), result.contact] }))
      }
      return result
    },
    remove: async (id) => {
      await get().load()
      await window.mailapp.contacts.delete(id)
      set(({ contacts }) => ({ contacts: contacts.filter((contact) => contact.id !== id) }))
    }
  }
})
