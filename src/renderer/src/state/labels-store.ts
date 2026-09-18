import { create } from 'zustand'
import type { LabelSummary } from '@shared/ipc'
import { useMailStore } from './mail-store'

interface LabelsState {
  labels: LabelSummary[]
  selectedLabelId: string | null
  loading: boolean
  error: string | null

  loadLabels: (accountId?: string) => Promise<void>
  createLabel: (name: string, color: string, accountId?: string | null) => Promise<LabelSummary>
  updateLabel: (id: string, name: string, color: string) => Promise<void>
  deleteLabel: (id: string) => Promise<void>
  selectLabel: (id: string | null) => Promise<void>
  toggleMessageLabel: (messageId: string, label: LabelSummary) => Promise<void>
}

export const useLabelsStore = create<LabelsState>((set, get) => ({
  labels: [],
  selectedLabelId: null,
  loading: false,
  error: null,

  loadLabels: async (accountId?: string) => {
    try {
      const labels = await window.mailapp.labels.list(accountId)
      set({ labels, error: null })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  createLabel: async (name: string, color: string, accountId?: string | null) => {
    try {
      const label = await window.mailapp.labels.create({ name, color, accountId })
      set({ labels: [...get().labels, label] })
      return label
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  updateLabel: async (id: string, name: string, color: string) => {
    try {
      const updated = await window.mailapp.labels.update({ id, name, color })
      set({
        labels: get().labels.map((l) => (l.id === id ? updated : l))
      })
      // Odśwież widok mailstore jeśli ta etykieta była zaznaczona
      if (get().selectedLabelId === id) {
        useMailStore.getState().refreshCurrentFolder({ silent: true })
      }
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  deleteLabel: async (id: string) => {
    try {
      await window.mailapp.labels.delete(id)
      set({
        labels: get().labels.filter((l) => l.id !== id),
        selectedLabelId: get().selectedLabelId === id ? null : get().selectedLabelId
      })
      // Jeśli usunięto aktualnie wybraną etykietę, przełącz do inbox
      if (get().selectedLabelId === id) {
        useMailStore.getState().selectUnifiedInbox()
      }
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  selectLabel: async (id: string | null) => {
    set({ selectedLabelId: id })
    if (id) {
      await useMailStore.getState().selectLabel(id)
    }
  },

  toggleMessageLabel: async (messageId: string, label: LabelSummary) => {
    await useMailStore.getState().toggleMessageLabel(messageId, label)
    // Przelicz statystyki etykiet w sidebarze
    get().loadLabels()
  }
}))

if (typeof window !== 'undefined') {
  ;(window as any).__labelsStore = useLabelsStore
}
