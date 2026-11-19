import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useCalendarStore } from '../state/calendar-store'
import type { CalendarEvent } from '@shared/ipc'
import { Modal } from './ui/Modal'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Button, Icon, IconButton } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Field } from './ui/Field'
import { LABEL_COLORS } from './LabelDialog'
import { layoutDay } from '../utils/calendar-layout'
import { useTranslation } from '../i18n'

interface CalendarViewProps {
  onBackToMail: () => void
  onOpenCompose: (prefill?: { to?: string; subject?: string; bodyHtml?: string }) => void
}

type Mode = 'day' | 'week' | 'month' | 'agenda'

const EVENT_COLORS = LABEL_COLORS.slice(0, 7)
const HOUR_PX = 44

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const addDays = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, date.getHours(), date.getMinutes())
const addMonths = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth() + n, 1)
const isSameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
const dateKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const pad = (n: number): string => String(n).padStart(2, '0')
const toLocalInput = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

interface EventForm {
  id: string | null
  title: string
  description: string
  startLocal: string
  endLocal: string
  allDay: boolean
  color: string
}

function blankForm(start: Date, allDay = false): EventForm {
  const s = new Date(start)
  if (s.getHours() === 0 && s.getMinutes() === 0 && !allDay) s.setHours(9)
  return { id: null, title: '', description: '', startLocal: toLocalInput(s), endLocal: toLocalInput(new Date(s.getTime() + 3600_000)), allDay, color: EVENT_COLORS[0] }
}

const formFromEvent = (ev: CalendarEvent): EventForm => ({
  id: ev.id,
  title: ev.title,
  description: ev.description ?? '',
  startLocal: toLocalInput(new Date(ev.startTz)),
  endLocal: toLocalInput(new Date(ev.endTz)),
  allDay: ev.allDay,
  color: ev.color
})

/** Events touching a given calendar day (multi-day events appear on every day they span). */
const eventsOn = (events: CalendarEvent[], day: Date): CalendarEvent[] => {
  const s = startOfDay(day).getTime()
  const e = s + 86_400_000
  return events.filter((ev) => new Date(ev.startTz).getTime() < e && new Date(ev.endTz).getTime() > s)
}

export function CalendarView({ onBackToMail, onOpenCompose }: CalendarViewProps): JSX.Element {
  const { t, locale, formatDate } = useTranslation()
  const { accounts, selectedAccountId } = useAccountsStore()
  const accountId = selectedAccountId || accounts[0]?.id || null
  const { events, load, create, update, remove, error } = useCalendarStore()

  const [mode, setMode] = useState<Mode>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [form, setForm] = useState<EventForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (accountId) load(accountId)
  }, [accountId, load])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Start the time grid at 07:00 instead of midnight.
  useEffect(() => {
    if (mode === 'week' || mode === 'day') gridRef.current?.scrollTo({ top: 7 * HOUR_PX - 8 })
  }, [mode])

  const dayNamesShort = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => t(`calendar.days_short.${d}`))
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)), [cursor])
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), i)), [cursor])
  const sorted = useMemo(() => [...events].sort((a, b) => a.startTz.localeCompare(b.startTz)), [events])
  const columns = mode === 'day' ? [cursor] : weekDays

  const period =
    mode === 'month' || mode === 'agenda'
      ? cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
      : mode === 'week'
        ? `${weekDays[0].toLocaleDateString(locale, { day: 'numeric', month: weekDays[0].getMonth() === weekDays[6].getMonth() ? undefined : 'short' })} – ${weekDays[6].toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : cursor.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const step = (dir: 1 | -1): void => setCursor((d) => (mode === 'month' || mode === 'agenda' ? addMonths(d, dir) : addDays(d, dir * (mode === 'week' ? 7 : 1))))
  const time = (iso: string): string => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  const save = async (): Promise<void> => {
    if (!form || !accountId) return
    const start = new Date(form.startLocal)
    const end = new Date(form.allDay ? form.endLocal.slice(0, 10) + 'T23:59' : form.endLocal)
    if (!form.title.trim()) return setFormError(t('calendar.dialog.error_title'))
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return setFormError(t('calendar.dialog.error_range'))
    setSaving(true)
    setFormError(null)
    try {
      const payload = { title: form.title.trim(), description: form.description.trim() || undefined, startTz: start.toISOString(), endTz: end.toISOString(), allDay: form.allDay, color: form.color }
      if (form.id) await update(form.id, payload)
      else await create(accountId, payload)
      setForm(null)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openNew = (start: Date, allDay = false): void => {
    setFormError(null)
    setForm(blankForm(start, allDay))
  }
  const openEdit = (ev: CalendarEvent): void => {
    setFormError(null)
    setForm(formFromEvent(ev))
  }

  if (!accountId) {
    return (
      <EmptyState
        icon="calendar_month"
        title={t('calendar.no_account')}
        action={
          <Button size="sm" onClick={onBackToMail}>
            {t('calendar.back_to_mail')}
          </Button>
        }
      />
    )
  }

  const chip = (ev: CalendarEvent, compact = false): JSX.Element => (
    <button
      key={ev.id}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openEdit(ev)
      }}
      title={ev.title}
      className="w-full flex items-center gap-1.5 h-5 px-1.5 rounded-sm text-2xs text-left text-ink truncate hover:bg-hover"
      style={{ boxShadow: `inset 2px 0 0 ${ev.color}`, backgroundColor: `color-mix(in srgb, ${ev.color} 12%, transparent)` }}
    >
      {!ev.allDay && !compact && <span className="text-ink-3 tabular-nums">{time(ev.startTz)}</span>}
      <span className="truncate font-medium">{ev.title}</span>
    </button>
  )

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="flex items-center gap-3 flex-wrap px-5 py-2.5 border-b border-line">
        <IconButton icon="arrow_back" label={t('calendar.back_to_mail')} onClick={onBackToMail} className="md:hidden" />
        <h1 className="font-serif text-xl text-ink first-letter:uppercase min-w-[12ch]">{period}</h1>
        <div className="flex items-center">
          <IconButton icon="chevron_left" label={t('calendar.prev')} onClick={() => step(-1)} />
          <Button size="sm" variant="ghost" onClick={() => {
            setCursor(new Date())
            setSelectedDay(new Date())
          }}>
            {t('calendar.today')}
          </Button>
          <IconButton icon="chevron_right" label={t('calendar.next')} onClick={() => step(1)} />
        </div>
        <span className="flex-1" />
        <div className="segmented" role="group" aria-label={t('calendar.view_label')}>
          {(['day', 'week', 'month', 'agenda'] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(`calendar.mode_${m}`)}
            </button>
          ))}
        </div>
        <Button size="sm" variant="primary" icon="add" onClick={() => openNew(selectedDay)}>
          {t('calendar.new_event')}
        </Button>
      </header>

      {error && (
        <p role="alert" className="px-5 py-2 text-xs bg-danger-soft text-danger border-b border-line">
          {error}
        </p>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Rail: mini month + selected day */}
        <aside className="w-64 flex-shrink-0 border-r border-line overflow-y-auto px-4 py-4 max-lg:hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink first-letter:uppercase">{cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
            <span className="flex">
              <IconButton size="xs" icon="chevron_left" label={t('calendar.prev')} onClick={() => setCursor((d) => addMonths(d, -1))} />
              <IconButton size="xs" icon="chevron_right" label={t('calendar.next')} onClick={() => setCursor((d) => addMonths(d, 1))} />
            </span>
          </div>
          <div className="grid grid-cols-7 text-center text-2xs text-ink-3 mb-1" aria-hidden="true">
            {dayNamesShort.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-xs" role="grid">
            {monthDays.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth()
              const sel = isSameDay(d, selectedDay)
              const today = isSameDay(d, now)
              const has = eventsOn(events, d).length > 0
              return (
                <button
                  key={dateKey(d)}
                  type="button"
                  aria-pressed={sel}
                  aria-label={d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
                  onClick={() => {
                    setSelectedDay(d)
                    setCursor(d)
                  }}
                  className={`relative h-7 rounded tabular-nums ${sel ? 'bg-ink text-canvas font-semibold' : today ? 'text-accent-ink font-semibold hover:bg-hover' : inMonth ? 'text-ink hover:bg-hover' : 'text-ink-3/60 hover:bg-hover'}`}
                >
                  {d.getDate()}
                  {has && !sel && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
                </button>
              )
            })}
          </div>

          <h2 className="eyebrow mt-6 mb-2 first-letter:uppercase">{selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          {eventsOn(sorted, selectedDay).length === 0 ? (
            <p className="text-xs text-ink-3">{t('calendar.no_events_day')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {eventsOn(sorted, selectedDay).map((ev) => (
                <li key={ev.id}>
                  <button type="button" onClick={() => openEdit(ev)} className="w-full flex items-start gap-2 px-2 py-1.5 rounded hover:bg-hover text-left">
                    <span className="mt-1 w-1.5 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink truncate">{ev.title}</span>
                      <span className="block text-xs text-ink-3">{ev.allDay ? t('calendar.dialog.all_day') : `${time(ev.startTz)} – ${time(ev.endTz)}`}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main view */}
        <section className="flex-1 min-w-0 flex flex-col" aria-label={period}>
          {mode === 'month' && (
            <>
              <div className="grid grid-cols-7 border-b border-line" aria-hidden="true">
                {dayNamesShort.map((d) => (
                  <div key={d} className="px-2 py-1.5 text-2xs font-medium text-ink-3 uppercase">
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7 grid-rows-6 min-h-0">
                {monthDays.map((d) => {
                  const inMonth = d.getMonth() === cursor.getMonth()
                  const today = isSameDay(d, now)
                  const dayEvents = eventsOn(sorted, d)
                  return (
                    <div
                      key={dateKey(d)}
                      onDoubleClick={() => openNew(d)}
                      className={`group min-h-0 overflow-hidden border-r border-b border-line px-1 pt-1 pb-0.5 flex flex-col gap-0.5 ${inMonth ? '' : 'bg-sunken/40'} ${isSameDay(d, selectedDay) ? 'shadow-[inset_0_0_0_1px_var(--accent)]' : ''}`}
                    >
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setSelectedDay(d)}
                          className={`w-6 h-6 rounded-full text-xs tabular-nums ${today ? 'bg-accent text-on-accent font-semibold' : inMonth ? 'text-ink hover:bg-hover' : 'text-ink-3'}`}
                          aria-label={d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
                        >
                          {d.getDate()}
                        </button>
                        <span className="flex-1" />
                        <IconButton size="xs" icon="add" label={t('calendar.new_event')} className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => openNew(d)} />
                      </div>
                      {dayEvents.slice(0, 3).map((ev) => chip(ev))}
                      {dayEvents.length > 3 && (
                        <button type="button" onClick={() => setSelectedDay(d)} className="text-2xs text-ink-3 text-left pl-1.5 hover:text-ink">
                          +{dayEvents.length - 3} {t('calendar.more_suffix')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {(mode === 'week' || mode === 'day') && (
            <>
              <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0,1fr))` }}>
                <div />
                {columns.map((d) => (
                  <div key={dateKey(d)} className="px-2 pt-2 pb-1 border-l border-line">
                    <button type="button" onClick={() => setSelectedDay(d)} className="flex items-baseline gap-1.5">
                      <span className="text-2xs uppercase text-ink-3">{dayNamesShort[(d.getDay() + 6) % 7]}</span>
                      <span className={`text-lg tabular-nums ${isSameDay(d, now) ? 'text-accent-ink font-semibold' : 'text-ink'}`}>{d.getDate()}</span>
                    </button>
                    <div className="mt-1 flex flex-col gap-0.5 min-h-[20px]">{eventsOn(sorted, d).filter((ev) => ev.allDay).map((ev) => chip(ev, true))}</div>
                  </div>
                ))}
              </div>
              <div ref={gridRef} className="flex-1 overflow-y-auto">
                <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0,1fr))`, height: 24 * HOUR_PX }}>
                  <div className="relative">
                    {Array.from({ length: 23 }, (_, i) => (
                      <span key={i} className="absolute right-2 -translate-y-1/2 text-2xs text-ink-3 tabular-nums" style={{ top: (i + 1) * HOUR_PX }}>
                        {pad(i + 1)}:00
                      </span>
                    ))}
                  </div>
                  {columns.map((d) => {
                    const dayStart = startOfDay(d).getTime()
                    const placed = layoutDay(
                      eventsOn(events, d)
                        .filter((ev) => !ev.allDay)
                        .map((ev) => ({ id: ev.id, start: new Date(ev.startTz).getTime(), end: new Date(ev.endTz).getTime(), ev })),
                      dayStart
                    )
                    return (
                      <div
                        key={dateKey(d)}
                        className="relative border-l border-line"
                        style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_PX - 1}px, var(--line) ${HOUR_PX - 1}px ${HOUR_PX}px)` }}
                        onDoubleClick={(e) => {
                          const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top
                          const start = new Date(dayStart)
                          start.setMinutes(Math.floor(y / HOUR_PX) * 60)
                          openNew(start)
                        }}
                      >
                        {placed.map(({ item, top, height, lane, lanes }) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openEdit(item.ev)}
                            className="absolute rounded-sm px-1.5 py-0.5 text-left overflow-hidden text-2xs text-ink hover:z-10 focus:z-10"
                            style={{
                              top: (top / 60) * HOUR_PX + 1,
                              height: Math.max((height / 60) * HOUR_PX - 2, 18),
                              left: `calc(${(lane / lanes) * 100}% + 2px)`,
                              width: `calc(${100 / lanes}% - 4px)`,
                              backgroundColor: `color-mix(in srgb, ${item.ev.color} 16%, var(--panel))`,
                              boxShadow: `inset 3px 0 0 ${item.ev.color}`
                            }}
                          >
                            <span className="block font-medium truncate">{item.ev.title}</span>
                            <span className="block text-ink-2 tabular-nums">
                              {time(item.ev.startTz)} – {time(item.ev.endTz)}
                            </span>
                          </button>
                        ))}
                        {isSameDay(d, now) && (
                          <span className="absolute left-0 right-0 h-px bg-danger pointer-events-none" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }} aria-hidden="true">
                            <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-danger" />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {mode === 'agenda' && (
            <div className="flex-1 overflow-y-auto">
              {sorted.length === 0 ? (
                <EmptyState icon="event_busy" title={t('calendar.no_events_agenda')} />
              ) : (
                <ul className="max-w-[760px] px-6 py-4">
                  {sorted.map((ev, i) => {
                    const d = new Date(ev.startTz)
                    const newDay = i === 0 || !isSameDay(d, new Date(sorted[i - 1].startTz))
                    return (
                      <li key={ev.id} className={newDay ? 'mt-4 first:mt-0' : ''}>
                        {newDay && <p className="eyebrow mb-1.5 first-letter:uppercase">{formatDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                        <button type="button" onClick={() => openEdit(ev)} className="w-full flex items-center gap-4 px-3 py-2 rounded hover:bg-hover text-left border-b border-line">
                          <span className="w-24 flex-shrink-0 text-xs text-ink-2 tabular-nums">{ev.allDay ? t('calendar.dialog.all_day') : `${time(ev.startTz)} – ${time(ev.endTz)}`}</span>
                          <span className="w-1.5 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: ev.color }} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-ink truncate">{ev.title}</span>
                            {ev.description && <span className="block text-xs text-ink-3 truncate">{ev.description}</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        size="sm"
        title={form?.id ? t('calendar.dialog.edit_title') : t('calendar.dialog.new_title')}
        footer={
          form && (
            <>
              {form.id && (
                <Button variant="danger-ghost" size="sm" icon="delete" onClick={() => setDeleteOpen(true)} disabled={saving} className="mr-auto">
                  {t('common.delete')}
                </Button>
              )}
              <Button size="sm" onClick={() => setForm(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!form.title.trim()}>
                {t('common.save')}
              </Button>
            </>
          )
        }
      >
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Field label={t('calendar.dialog.title')}>
              {({ id }) => <input id={id} autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('calendar.dialog.title_placeholder')} />}
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer w-fit">
              <input type="checkbox" role="switch" className="switch" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
              {t('calendar.dialog.all_day')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('calendar.dialog.start')}>
                {({ id }) => (
                  <input
                    id={id}
                    className="input"
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.allDay ? form.startLocal.slice(0, 10) : form.startLocal}
                    onChange={(e) => setForm({ ...form, startLocal: form.allDay ? `${e.target.value}T00:00` : e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('calendar.dialog.end')}>
                {({ id }) => (
                  <input
                    id={id}
                    className="input"
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.allDay ? form.endLocal.slice(0, 10) : form.endLocal}
                    onChange={(e) => setForm({ ...form, endLocal: form.allDay ? `${e.target.value}T23:59` : e.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field label={t('calendar.dialog.desc')}>{({ id }) => <textarea id={id} className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
            <fieldset>
              <legend className="field-label mb-2">{t('calendar.dialog.color')}</legend>
              <div className="flex gap-1.5" role="radiogroup">
                {EVENT_COLORS.map((c) => (
                  <label key={c} className="cursor-pointer">
                    <input type="radio" name="event-color" className="peer sr-only" checked={form.color === c} onChange={() => setForm({ ...form, color: c })} aria-label={c} />
                    <span className="block w-6 h-6 rounded border-2 border-transparent peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent" style={{ backgroundColor: c, boxShadow: 'inset 0 0 0 2px var(--raised)' }} />
                  </label>
                ))}
              </div>
            </fieldset>
            {formError && (
              <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
                <Icon name="error" className="!text-[15px]" />
                {formError}
              </p>
            )}
            {form.id && (
              <Button size="sm" variant="ghost" icon="mail" className="self-start" onClick={() => onOpenCompose({ subject: form.title, bodyHtml: t('calendar.invite_body', { title: form.title }) })}>
                {t('calendar.send_invite')}
              </Button>
            )}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!form?.id) return
          await remove(form.id)
          setForm(null)
        }}
        title={t('calendar.dialog.delete_title')}
        description={form ? t('calendar.dialog.delete_desc', { title: form.title }) : undefined}
        confirmLabel={t('common.delete')}
        danger
      />
    </div>
  )
}
