import { create } from 'zustand'
import type { FollowUpSummary, ScheduledMessageSummary, SnoozedMessageSummary } from '@shared/ipc'

export type SpecialView = 'none' | 'scheduled' | 'snoozed' | 'followups'

interface SchedulerState {
  view: SpecialView
  scheduled: ScheduledMessageSummary[]
  snoozed: SnoozedMessageSummary[]
  followUps: FollowUpSummary[]
  loading: boolean

  showView: (view: SpecialView) => Promise<void>
  cancelScheduled: (id: string) => Promise<void>
  cancelFollowUp: (id: string) => Promise<void>
  refreshCurrent: () => Promise<void>
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  view: 'none',
  scheduled: [],
  snoozed: [],
  followUps: [],
  loading: false,

  showView: async (view) => {
    set({ view, loading: true })
    try {
      if (view === 'scheduled') set({ scheduled: await window.mailapp.scheduled.list() })
      else if (view === 'snoozed') set({ snoozed: await window.mailapp.snoozed.list() })
      else if (view === 'followups') set({ followUps: await window.mailapp.followUps.list() })
    } finally {
      set({ loading: false })
    }
  },

  cancelScheduled: async (id) => {
    await window.mailapp.scheduled.cancel(id)
    set({ scheduled: get().scheduled.filter((s) => s.id !== id) })
  },

  cancelFollowUp: async (id) => {
    await window.mailapp.followUps.cancel(id)
    set({ followUps: get().followUps.filter((f) => f.id !== id) })
  },

  refreshCurrent: async () => {
    const { view, showView } = get()
    if (view !== 'none') await showView(view)
  }
}))
