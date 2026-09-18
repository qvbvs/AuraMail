import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import { z } from 'zod'

const createEventSchema = z.object({
  accountId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startTz: z.string().min(1),
  endTz: z.string().min(1),
  allDay: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
})

const updateEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  startTz: z.string().min(1).optional(),
  endTz: z.string().min(1).optional(),
  allDay: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
})

export interface CalendarEventRow {
  id: string
  account_id: string
  title: string
  description: string | null
  start_tz: string
  end_tz: string
  all_day: number
  color: string
  created_at: string
  updated_at: string
}

export function mapCalendarEvent(row: CalendarEventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startTz: row.start_tz,
    endTz: row.end_tz,
    allDay: row.all_day === 1,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listCalendarEvents(db: Database.Database, accountId: string): ReturnType<typeof mapCalendarEvent>[] {
  const rows = db.prepare(
    `SELECT * FROM calendar_events WHERE account_id = ? ORDER BY start_tz ASC`
  ).all(accountId) as CalendarEventRow[]
  return rows.map(mapCalendarEvent)
}

export function createCalendarEvent(
  db: Database.Database,
  input: z.infer<typeof createEventSchema>
): { id: string } {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO calendar_events (id, account_id, title, description, start_tz, end_tz, all_day, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.accountId,
    input.title,
    input.description ?? null,
    input.startTz,
    input.endTz,
    input.allDay ? 1 : 0,
    input.color ?? '#4f46e5',
    now,
    now
  )
  return { id }
}

export function updateCalendarEvent(
  db: Database.Database,
  input: z.infer<typeof updateEventSchema>
): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (input.title !== undefined) { sets.push('title = ?'); values.push(input.title) }
  if (input.description !== undefined) { sets.push('description = ?'); values.push(input.description ?? null) }
  if (input.startTz !== undefined) { sets.push('start_tz = ?'); values.push(input.startTz) }
  if (input.endTz !== undefined) { sets.push('end_tz = ?'); values.push(input.endTz) }
  if (input.allDay !== undefined) { sets.push('all_day = ?'); values.push(input.allDay ? 1 : 0) }
  if (input.color !== undefined) { sets.push('color = ?'); values.push(input.color) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(input.id)
  db.prepare(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteCalendarEvent(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id)
}
