import type Database from 'better-sqlite3-multiple-ciphers'
import type { FollowUpSummary } from '@shared/ipc'

interface FollowUpRow {
  id: string
  remind_after: string
  status: string
  subject: string
  to_json: string
  date_sent: string | null
}

function toSummary(row: FollowUpRow): FollowUpSummary {
  const toList = JSON.parse(row.to_json) as { email: string }[]
  return {
    id: row.id,
    subject: row.subject,
    toAddr: toList[0]?.email ?? '',
    sentAt: row.date_sent,
    remindAfter: row.remind_after,
    status: row.status as FollowUpSummary['status']
  }
}

export function listFollowUps(db: Database.Database): FollowUpSummary[] {
  const rows = db
    .prepare(
      `SELECT fu.id, fu.remind_after, fu.status, m.subject, m.to_json, m.date_sent
       FROM follow_ups fu JOIN messages m ON m.id = fu.sent_message_id
       WHERE fu.status = 'pending'
       ORDER BY fu.remind_after ASC`
    )
    .all() as FollowUpRow[]
  return rows.map(toSummary)
}

export function cancelFollowUp(db: Database.Database, id: string): void {
  db.prepare(`UPDATE follow_ups SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(id)
}

export function listDueFollowUps(db: Database.Database, nowIso: string): { id: string; subject: string }[] {
  return db
    .prepare(
      `SELECT fu.id, m.subject
       FROM follow_ups fu JOIN messages m ON m.id = fu.sent_message_id
       WHERE fu.status = 'pending' AND fu.remind_after <= ? AND fu.notified_at IS NULL`
    )
    .all(nowIso) as { id: string; subject: string }[]
}

export function markFollowUpNotified(db: Database.Database, id: string): void {
  db.prepare('UPDATE follow_ups SET notified_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

/**
 * Wykrywanie odpowiedzi na wiadomość z aktywnym follow-upem (plan 7.15): jeśli nowo
 * zsynchronizowana wiadomość przychodząca wskazuje (In-Reply-To/References) na Message-ID
 * jednej z NASZYCH wysłanych wiadomości mających otwarty follow-up, oznacz go jako
 * rozwiązany — przypomnienie nie zostanie wysłane.
 */
export function resolveFollowUpsForIncomingMessage(
  db: Database.Database,
  accountId: string,
  incoming: { inReplyTo: string | null; references: string[] }
): void {
  const candidates = [incoming.inReplyTo, ...incoming.references].filter((x): x is string => Boolean(x))
  if (candidates.length === 0) return

  const placeholders = candidates.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT fu.id as followUpId
       FROM follow_ups fu
       JOIN messages m ON m.id = fu.sent_message_id
       WHERE fu.status = 'pending' AND m.account_id = ? AND m.message_id IN (${placeholders})`
    )
    .all(accountId, ...candidates) as { followUpId: string }[]

  for (const row of rows) {
    db.prepare(`UPDATE follow_ups SET status = 'resolved', resolved_reason = 'reply_detected' WHERE id = ?`).run(row.followUpId)
  }
}
