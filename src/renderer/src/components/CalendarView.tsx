import React, { useEffect, useMemo, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useCalendarStore } from '../state/calendar-store'
import type { CalendarEvent } from '@shared/ipc'
import { Modal } from './ui/Modal'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Button } from './ui/Button'
import { useTranslation } from '../i18n'

interface CalendarViewProps {
  onBackToMail: () => void
  onOpenCompose: (prefill?: { to?: string; subject?: string; bodyHtml?: string }) => void
}

type CalendarViewMode = 'day' | 'week' | 'month' | 'agenda'

const EVENT_COLORS = ['#4f46e5', '#0ea5e9', '#059669', '#d97706', '#7c3aed', '#e11d48']
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i) // 07:00 - 20:00

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // 0 = poniedziałek
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getMonthGridDays(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

interface EventFormState {
  id: string | null
  title: string
  description: string
  startLocal: string
  endLocal: string
  allDay: boolean
  color: string
}

function blankForm(start: Date): EventFormState {
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    id: null,
    title: '',
    description: '',
    startLocal: toLocalInputValue(start),
    endLocal: toLocalInputValue(end),
    allDay: false,
    color: EVENT_COLORS[0]
  }
}

function formFromEvent(ev: CalendarEvent): EventFormState {
  return {
    id: ev.id,
    title: ev.title,
    description: ev.description ?? '',
    startLocal: toLocalInputValue(new Date(ev.startTz)),
    endLocal: toLocalInputValue(new Date(ev.endTz)),
    allDay: ev.allDay,
    color: ev.color
  }
}

export function CalendarView({ onBackToMail, onOpenCompose }: CalendarViewProps): JSX.Element {
  const { t, locale } = useTranslation()
  const DAY_NAMES = [
    t('calendar.days.monday'),
    t('calendar.days.tuesday'),
    t('calendar.days.wednesday'),
    t('calendar.days.thursday'),
    t('calendar.days.friday'),
    t('calendar.days.saturday'),
    t('calendar.days.sunday')
  ]
  const DAY_NAMES_SHORT = [
    t('calendar.days_short.mon'),
    t('calendar.days_short.tue'),
    t('calendar.days_short.wed'),
    t('calendar.days_short.thu'),
    t('calendar.days_short.fri'),
    t('calendar.days_short.sat'),
    t('calendar.days_short.sun')
  ]
  const { accounts, selectedAccountId } = useAccountsStore()
  const activeAccountId = selectedAccountId || accounts[0]?.id || null
  const { events, load, create, update, remove, error } = useCalendarStore()

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [form, setForm] = useState<EventFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    if (activeAccountId) load(activeAccountId)
  }, [activeAccountId, load])

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const monthGridDays = useMemo(() => getMonthGridDays(currentDate), [currentDate])
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [currentDate])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = dateKey(new Date(ev.startTz))
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startTz).getTime() - new Date(b.startTz).getTime())
    }
    return map
  }, [events])

  const selectedDayEvents = eventsByDay.get(dateKey(selectedDay)) ?? []

  const agendaEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.startTz).getTime() - new Date(b.startTz).getTime()),
    [events]
  )

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    }
    if (viewMode === 'week') {
      const start = weekDays[0]
      const end = weekDays[6]
      const sameMonth = start.getMonth() === end.getMonth()
      const startLabel = start.toLocaleDateString(locale, { day: 'numeric', month: sameMonth ? undefined : 'short' })
      const endLabel = end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
      return `${startLabel} – ${endLabel}`
    }
    return currentDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }, [viewMode, currentDate, weekDays])

  const goPrev = (): void => {
    if (viewMode === 'month') setCurrentDate((d) => addMonths(d, -1))
    else if (viewMode === 'week') setCurrentDate((d) => addDays(d, -7))
    else setCurrentDate((d) => addDays(d, -1))
  }
  const goNext = (): void => {
    if (viewMode === 'month') setCurrentDate((d) => addMonths(d, 1))
    else if (viewMode === 'week') setCurrentDate((d) => addDays(d, 7))
    else setCurrentDate((d) => addDays(d, 1))
  }
  const goToday = (): void => {
    const now = new Date()
    setCurrentDate(now)
    setSelectedDay(now)
  }

  const openCreateForm = (start: Date): void => {
    setForm(blankForm(start))
  }
  const openEditForm = (ev: CalendarEvent): void => {
    setForm(formFromEvent(ev))
  }

  const handleSaveForm = async (): Promise<void> => {
    if (!form || !form.title.trim() || !activeAccountId) return
    setSaving(true)
    try {
      const startTz = new Date(form.startLocal).toISOString()
      const endTz = new Date(form.endLocal).toISOString()
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        startTz,
        endTz,
        allDay: form.allDay,
        color: form.color
      }
      if (form.id) {
        await update(form.id, payload)
      } else {
        await create(activeAccountId, payload)
      }
      setForm(null)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteForm = async (): Promise<void> => {
    if (!form?.id) return
    setSaving(true)
    try {
      await remove(form.id)
      setForm(null)
    } finally {
      setSaving(false)
    }
  }

  if (!activeAccountId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background dark:bg-[#0b0f19] text-on-surface dark:text-slate-100">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant">calendar_month</span>
        <p className="text-body-sm text-on-surface-variant dark:text-text-muted">
          {t('calendar.no_account')}
        </p>
        <button type="button" onClick={onBackToMail} className="text-primary dark:text-indigo-400 font-semibold text-body-sm">
          {t('calendar.back_to_mail')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background dark:bg-[#0b0f19] text-on-surface dark:text-slate-100 select-none">
      {/* Calendar Global Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-space-md px-space-xl py-space-sm bg-surface-container-lowest dark:bg-[#121826] border-b border-border-subtle dark:border-white/[0.06] shadow-sm z-10">
        <div className="flex items-center gap-space-lg">
          <button
            type="button"
            onClick={onBackToMail}
            className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white transition-colors flex items-center gap-1 text-caption"
            title={t('calendar.back_to_mail')}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span className="hidden sm:inline font-semibold">{t('calendar.back_to_mail')}</span>
          </button>

          <div className="flex items-center gap-space-xs bg-surface-container-low dark:bg-slate-800 px-space-xs py-1 rounded-xl shadow-inner border border-border-subtle dark:border-white/[0.04]">
            <button
              type="button"
              onClick={goPrev}
              className="p-1 rounded-lg text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white hover:bg-surface-container transition-all"
              title={t('calendar.prev')}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              type="button"
              onClick={goToday}
              className="px-space-sm py-0.5 rounded-lg text-body-sm font-title-sm text-on-surface dark:text-white hover:bg-surface-container transition-all font-semibold"
            >
              {t('calendar.today')}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="p-1 rounded-lg text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white hover:bg-surface-container transition-all"
              title={t('calendar.next')}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>

          <h2 className="font-headline-md text-headline-md font-bold text-on-surface dark:text-white tracking-tight capitalize">
            {periodLabel}
          </h2>

          <div className="hidden 2xl:flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container dark:bg-slate-800 text-on-surface-variant dark:text-text-muted font-label-mono text-caption">
            <span className="material-symbols-outlined text-[15px] text-secondary">public</span>
            <span>{timezone}</span>
          </div>
        </div>

        <div className="flex items-center gap-space-md">
          <div className="flex items-center bg-surface-container-low dark:bg-slate-800 p-0.5 rounded-xl shadow-inner border border-border-subtle dark:border-white/[0.04]">
            {(['day', 'week', 'month', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-space-md py-1 rounded-lg font-title-sm text-caption transition-all ${
                  viewMode === mode
                    ? 'bg-primary-container dark:bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white'
                }`}
              >
                {mode === 'day' ? t('calendar.mode_day') : mode === 'week' ? t('calendar.mode_week') : mode === 'month' ? t('calendar.mode_month') : t('calendar.mode_agenda')}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openCreateForm(new Date())}
            className="flex items-center justify-center gap-1.5 px-space-md py-2 rounded-xl bg-primary dark:bg-indigo-600 text-white hover:bg-primary-container shadow-md transition-all font-title-sm text-body-sm"
            title={t('calendar.new_event')}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span className="hidden sm:inline">{t('calendar.new_event')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-space-xl py-2 bg-error-container text-on-error-container text-caption">{error}</div>
      )}

      {/* Main Calendar Body */}
      <div className="flex-1 grid grid-cols-12 gap-space-md p-space-md overflow-hidden">
        {/* Left Sidebar */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-space-md overflow-y-auto">
          <div className="bg-surface-container-lowest dark:bg-[#121826] p-space-md rounded-2xl shadow-sm border border-border-subtle dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => openCreateForm(selectedDay)}
              className="w-full flex items-center justify-center gap-space-sm bg-primary dark:bg-indigo-600 text-white py-2.5 px-space-md rounded-xl shadow-md hover:bg-primary-container transition-all font-title-sm text-title-sm"
            >
              <span className="material-symbols-outlined text-[20px]">event_available</span>
              <span>{t('calendar.new_event')}</span>
            </button>
          </div>

          {/* Mini Monthly Calendar Widget (real) */}
          <div className="bg-surface-container-lowest dark:bg-[#121826] p-space-md rounded-2xl shadow-sm border border-border-subtle dark:border-white/[0.06]">
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-title-sm text-body-md font-bold text-on-surface dark:text-white capitalize">
                {currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentDate((d) => addMonths(d, -1))}
                  className="p-1 rounded-lg hover:bg-surface-container dark:hover:bg-slate-800"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDate((d) => addMonths(d, 1))}
                  className="p-1 rounded-lg hover:bg-surface-container dark:hover:bg-slate-800"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center font-label-mono text-caption text-on-surface-variant dark:text-text-muted mb-space-xs">
              {DAY_NAMES_SHORT.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 text-center font-body-sm text-body-sm gap-y-1">
              {monthGridDays.map((d) => {
                const inCurrentMonth = d.getMonth() === currentDate.getMonth()
                const isSelected = isSameDay(d, selectedDay)
                const isToday = isSameDay(d, new Date())
                const hasEvents = (eventsByDay.get(dateKey(d)) ?? []).length > 0
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    className={`py-1 rounded-lg font-medium transition-colors relative ${
                      !inCurrentMonth ? 'text-on-surface-variant/30 dark:text-slate-700' : ''
                    } ${
                      isSelected
                        ? 'bg-primary dark:bg-indigo-600 text-white font-bold shadow-sm'
                        : isToday
                        ? 'text-primary dark:text-indigo-400 font-bold bg-primary/10'
                        : 'hover:bg-surface-container dark:hover:bg-slate-800 text-on-surface dark:text-slate-200'
                    }`}
                  >
                    {d.getDate()}
                    {hasEvents && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-container" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Agenda dnia wybranego w mini-kalendarzu (real) */}
          <div className="bg-surface-container-lowest dark:bg-[#121826] p-space-md rounded-2xl shadow-sm border border-border-subtle dark:border-white/[0.06] space-y-2">
            <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant dark:text-text-muted font-bold">
              {selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <div className="space-y-1 text-body-sm font-title-sm">
              {selectedDayEvents.length === 0 ? (
                <p className="text-caption text-on-surface-variant dark:text-text-muted py-2">{t('calendar.no_events_day')}</p>
              ) : (
                selectedDayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => openEditForm(ev)}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-container dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <span className="truncate">{ev.title}</span>
                    {!ev.allDay && (
                      <span className="ml-auto font-label-mono text-caption text-on-surface-variant flex-shrink-0">
                        {new Date(ev.startTz).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Main Area */}
        <div className="col-span-12 lg:col-span-8 xl:col-span-9 bg-surface-container-lowest dark:bg-[#121826] rounded-2xl shadow-sm border border-border-subtle dark:border-white/[0.06] flex flex-col overflow-hidden">
          {viewMode === 'month' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-7 border-b border-border-subtle dark:border-white/[0.06] bg-surface-container-low/50 dark:bg-slate-800/40">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className="p-2 text-center text-caption font-label-mono text-on-surface-variant dark:text-text-muted uppercase"
                  >
                    {d.slice(0, 3)}
                  </div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-y-auto">
                {monthGridDays.map((d) => {
                  const inCurrentMonth = d.getMonth() === currentDate.getMonth()
                  const isToday = isSameDay(d, new Date())
                  const dayEvents = eventsByDay.get(dateKey(d)) ?? []
                  return (
                    <div
                      key={d.toISOString()}
                      onClick={() => {
                        setSelectedDay(d)
                        openCreateForm(d)
                      }}
                      className={`p-1.5 border-r border-b border-border-subtle/50 dark:border-white/[0.04] cursor-pointer hover:bg-surface-container-low/40 dark:hover:bg-slate-800/20 transition-colors flex flex-col gap-1 min-h-[80px] ${
                        !inCurrentMonth ? 'opacity-40' : ''
                      }`}
                    >
                      <span
                        className={`text-caption font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-primary text-white' : 'text-on-surface dark:text-slate-300'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditForm(ev)
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate"
                            style={{ backgroundColor: ev.color }}
                            title={ev.title}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-on-surface-variant dark:text-text-muted pl-1">
                            +{dayEvents.length - 3} {t('calendar.more_suffix')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {(viewMode === 'week' || viewMode === 'day') && (
            <>
              <div
                className="grid border-b border-border-subtle dark:border-white/[0.06] bg-surface-container-low/50 dark:bg-slate-800/40"
                style={{ gridTemplateColumns: `72px repeat(${viewMode === 'week' ? 7 : 1}, 1fr)` }}
              >
                <div className="p-3 text-caption font-label-mono text-on-surface-variant dark:text-text-muted text-center border-r border-border-subtle dark:border-white/[0.04]">
                  {t('calendar.time_column')}
                </div>
                {(viewMode === 'week' ? weekDays : [currentDate]).map((d) => (
                  <div
                    key={d.toISOString()}
                    className={`p-3 text-center border-r border-border-subtle dark:border-white/[0.04] last:border-r-0 ${
                      isSameDay(d, new Date()) ? 'bg-primary/5 dark:bg-indigo-950/30' : ''
                    }`}
                  >
                    <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted block uppercase">
                      {DAY_NAMES_SHORT[(d.getDay() + 6) % 7]}
                    </span>
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-title-sm mt-0.5 ${
                        isSameDay(d, new Date()) ? 'bg-primary dark:bg-indigo-600 text-white shadow-sm' : 'text-on-surface dark:text-white'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/50 dark:divide-white/[0.04]">
                {HOURS.map((hr) => (
                  <div
                    key={hr}
                    className="grid min-h-[56px]"
                    style={{ gridTemplateColumns: `72px repeat(${viewMode === 'week' ? 7 : 1}, 1fr)` }}
                  >
                    <div className="p-2 text-caption font-label-mono text-on-surface-variant dark:text-text-muted text-center border-r border-border-subtle dark:border-white/[0.04]">
                      {String(hr).padStart(2, '0')}:00
                    </div>
                    {(viewMode === 'week' ? weekDays : [currentDate]).map((d) => {
                      const dayEvents = (eventsByDay.get(dateKey(d)) ?? []).filter(
                        (ev) => !ev.allDay && new Date(ev.startTz).getHours() === hr
                      )
                      return (
                        <div
                          key={d.toISOString()}
                          onClick={() => {
                            const start = new Date(d)
                            start.setHours(hr, 0, 0, 0)
                            openCreateForm(start)
                          }}
                          className="p-1 border-r border-border-subtle/50 dark:border-white/[0.04] last:border-r-0 relative hover:bg-surface-container-low/40 dark:hover:bg-slate-800/20 transition-colors cursor-pointer"
                        >
                          {dayEvents.map((ev) => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditForm(ev)
                              }}
                              className="p-1.5 rounded-lg shadow-sm text-caption text-white cursor-pointer hover:shadow-md transition-all mb-0.5"
                              style={{ backgroundColor: ev.color }}
                            >
                              <div className="font-title-sm font-bold truncate leading-tight text-[11px]">{ev.title}</div>
                              <div className="text-[10px] opacity-90">
                                {new Date(ev.startTz).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} –{' '}
                                {new Date(ev.endTz).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </>
          )}

          {viewMode === 'agenda' && (
            <div className="flex-1 overflow-y-auto p-space-md space-y-2">
              {agendaEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-on-surface-variant dark:text-text-muted">
                  <span className="material-symbols-outlined text-[36px]">event_busy</span>
                  <p className="text-body-sm">{t('calendar.no_events_agenda')}</p>
                </div>
              ) : (
                agendaEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => openEditForm(ev)}
                    className="flex items-center gap-space-md p-space-md rounded-xl bg-surface-container-low/60 dark:bg-slate-800/40 hover:bg-surface-container dark:hover:bg-slate-800 cursor-pointer transition-colors border border-border-subtle dark:border-white/[0.04]"
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white truncate">
                        {ev.title}
                      </div>
                      {ev.description && (
                        <div className="text-caption text-on-surface-variant dark:text-text-muted truncate">
                          {ev.description}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 font-label-mono text-caption text-on-surface-variant dark:text-text-muted">
                      <div>{new Date(ev.startTz).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      {!ev.allDay && (
                        <div>{new Date(ev.startTz).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Event Create/Edit Modal */}
      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        size="sm"
        title={form?.id ? t('calendar.dialog.edit_title') : t('calendar.dialog.new_title')}
        footer={
          form && (
            <>
              {form.id ? (
                <Button variant="danger-subtle" size="sm" onClick={() => setDeleteConfirmOpen(true)} disabled={saving} className="mr-auto">
                  {t('common.delete')}
                </Button>
              ) : (
                <span className="mr-auto" />
              )}
              <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveForm} loading={saving} disabled={!form.title.trim()}>
                {t('common.save')}
              </Button>
            </>
          )
        }
      >
        {form && (
          <div className="space-y-space-md">
            <div className="space-y-1">
              <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('calendar.dialog.title')}</label>
              <input
                type="text"
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t('calendar.dialog.title_placeholder')}
                className="w-full bg-surface-container-low dark:bg-[#161f30] px-space-sm py-2 rounded-lg text-on-surface dark:text-white text-body-sm outline-none border border-border-subtle dark:border-white/[0.06]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('calendar.dialog.desc')}</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full bg-surface-container-low dark:bg-[#161f30] px-space-sm py-2 rounded-lg text-on-surface dark:text-white text-body-sm outline-none border border-border-subtle dark:border-white/[0.06] resize-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="allDay"
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              />
              <label htmlFor="allDay" className="font-caption text-caption text-on-surface dark:text-slate-300">
                {t('calendar.dialog.all_day')}
              </label>
            </div>

            <div className="grid grid-cols-2 gap-space-sm">
              <div className="space-y-1">
                <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('calendar.dialog.start')}</label>
                <input
                  type={form.allDay ? 'date' : 'datetime-local'}
                  value={form.allDay ? form.startLocal.slice(0, 10) : form.startLocal}
                  onChange={(e) => setForm({ ...form, startLocal: form.allDay ? `${e.target.value}T00:00` : e.target.value })}
                  className="w-full bg-surface-container-low dark:bg-[#161f30] px-space-sm py-2 rounded-lg text-on-surface dark:text-white text-body-sm outline-none border border-border-subtle dark:border-white/[0.06]"
                />
              </div>
              <div className="space-y-1">
                <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('calendar.dialog.end')}</label>
                <input
                  type={form.allDay ? 'date' : 'datetime-local'}
                  value={form.allDay ? form.endLocal.slice(0, 10) : form.endLocal}
                  onChange={(e) => setForm({ ...form, endLocal: form.allDay ? `${e.target.value}T23:59` : e.target.value })}
                  className="w-full bg-surface-container-low dark:bg-[#161f30] px-space-sm py-2 rounded-lg text-on-surface dark:text-white text-body-sm outline-none border border-border-subtle dark:border-white/[0.06]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-caption text-caption text-on-surface-variant dark:text-text-muted font-medium">{t('calendar.dialog.color')}</label>
              <div className="flex items-center gap-2">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-primary dark:ring-offset-[#121826]' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {form.id && (
              <button
                type="button"
                onClick={() =>
                  onOpenCompose({
                    subject: form.title,
                    bodyHtml: t('calendar.invite_body', { title: form.title })
                  })
                }
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-container-low dark:bg-slate-800 text-primary dark:text-indigo-400 font-title-sm text-caption font-semibold hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">mail</span>
                {t('calendar.send_invite')}
              </button>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteForm}
        title={t('calendar.dialog.delete_title')}
        description={form ? t('calendar.dialog.delete_desc', { title: form.title }) : undefined}
        confirmLabel={t('common.delete')}
        danger
      />
    </div>
  )
}
