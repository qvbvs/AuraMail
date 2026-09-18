import { create } from 'zustand'
import type { CalendarEvent, CreateCalendarEventInput, UpdateCalendarEventInput } from '@shared/ipc'

interface CalendarState {
  events: CalendarEvent[]
  loading: boolean
  error: string | null

  load: (accountId: string) => Promise<void>
  create: (accountId: string, input: CreateCalendarEventInput) => Promise<void>
  update: (id: string, patch: UpdateCalendarEventInput) => Promise<void>
  remove: (id: string) => Promise<void>
  reset: () => void
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  loading: false,
  error: null,

  load: async (accountId) => {
    set({ loading: true, error: null })
    try {
      const events = await window.mailapp.calendar.list(accountId)
      set({ events, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  create: async (accountId, input) => {
    try {
      const { id } = await window.mailapp.calendar.create({ ...input, accountId })
      const events = [
        ...get().events,
        {
          id,
          title: input.title,
          description: input.description ?? null,
          startTz: input.startTz,
          endTz: input.endTz,
          allDay: input.allDay ?? false,
          color: input.color ?? '#4f46e5',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
      set({ events })
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  update: async (id, patch) => {
    try {
      await window.mailapp.calendar.update(id, patch)
      set({
        events: get().events.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e))
      })
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await window.mailapp.calendar.delete(id)
      set({ events: get().events.filter((e) => e.id !== id) })
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    }
  },

  reset: () => set({ events: [], error: null })
}))

if (typeof window !== 'undefined') {
  ;(window as any).__calendarStore = useCalendarStore
}
