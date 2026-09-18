import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { ScheduleSendInput, ScheduledMessageSummary, ScheduledStatus } from '@shared/ipc'

interface ScheduledRow {
  id: string
  account_id: string
  payload_json: string
  send_at: string
  status: string
  last_error: string | null
}

function toSummary(row: ScheduledRow): ScheduledMessageSummary {
  const payload = JSON.parse(row.payload_json) as ScheduleSendInput
  return {
    id: row.id,
    accountId: row.account_id,
    to: payload.to,
    subject: payload.subject,
    sendAt: row.send_at,
    status: row.status as ScheduledStatus,
    lastError: row.last_error
  }
}

export function insertScheduled(db: Database.Database, input: ScheduleSendInput): string {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO scheduled_messages (id, account_id, payload_json, send_at, timezone, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, input.accountId, JSON.stringify(input), input.sendAt, input.timezone, new Date().toISOString())
  return id
}

export function listScheduled(db: Database.Database): ScheduledMessageSummary[] {
  const rows = db
    .prepare(`SELECT * FROM scheduled_messages WHERE status = 'pending' ORDER BY send_at ASC`)
    .all() as ScheduledRow[]
  return rows.map(toSummary)
}

export function cancelScheduled(db: Database.Database, id: string): void {
  db.prepare(`UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(id)
}

export interface DueScheduledRow {
  id: string
  payload: ScheduleSendInput
  sendAt: string
  retryCount: number
}

export function listDuePending(db: Database.Database, nowIso: string): DueScheduledRow[] {
  const rows = db
    .prepare(`SELECT id, payload_json, send_at, retry_count FROM scheduled_messages WHERE status = 'pending' AND send_at <= ?`)
    .all(nowIso) as { id: string; payload_json: string; send_at: string; retry_count: number }[]
  return rows.map((r) => ({ id: r.id, payload: JSON.parse(r.payload_json), sendAt: r.send_at, retryCount: r.retry_count }))
}

export function markScheduledSent(db: Database.Database, id: string): void {
  db.prepare(`UPDATE scheduled_messages SET status = 'sent' WHERE id = ?`).run(id)
}

const MAX_RETRIES = 5

/** Zwraca true, jeśli wpis trwale się nie powiódł (wyczerpano próby) — plan 7.10. */
export function markScheduledFailedOrRetry(db: Database.Database, id: string, error: string): boolean {
  const row = db.prepare('SELECT retry_count FROM scheduled_messages WHERE id = ?').get(id) as { retry_count: number } | undefined
  const nextCount = (row?.retry_count ?? 0) + 1
  if (nextCount >= MAX_RETRIES) {
    db.prepare(`UPDATE scheduled_messages SET status = 'failed', retry_count = ?, last_error = ? WHERE id = ?`).run(nextCount, error, id)
    return true
  }
  db.prepare(`UPDATE scheduled_messages SET retry_count = ?, last_error = ? WHERE id = ?`).run(nextCount, error, id)
  return false
}

export function markScheduledFailedStale(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE scheduled_messages SET status = 'failed', last_error = 'Wygasł termin wysyłki (aplikacja była wyłączona zbyt długo) — wymaga ręcznej akcji' WHERE id = ?`
  ).run(id)
}
