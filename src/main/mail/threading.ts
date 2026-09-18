import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'

/** Usuwa prefiksy Re:/Fwd:/Odp: (PL/EN, wielokrotne) i nadmiarowe spacje — plan sekcja 7.3. */
export function normalizeSubject(subject: string): string {
  let s = subject.trim()
  let changed = true
  while (changed) {
    const before = s
    s = s.replace(/^(re|fwd|odp|fw)\s*:\s*/i, '')
    changed = s !== before
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

interface ThreadInput {
  accountId: string
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string
  dateReceived: string | null
}

/**
 * Grupowanie wątków: najpierw po References/In-Reply-To (dokładne dopasowanie do
 * istniejącej wiadomości w tym samym wątku), z fallbackiem po znormalizowanym temacie
 * w obrębie konta — dla serwerów/klientów z niepełnymi/uszkodzonymi nagłówkami.
 */
export function resolveThreadId(db: Database.Database, input: ThreadInput): string {
  const candidateMessageIds = [input.inReplyTo, ...input.references].filter((x): x is string => Boolean(x))

  for (const candidate of candidateMessageIds) {
    const row = db
      .prepare('SELECT thread_id FROM messages WHERE account_id = ? AND message_id = ? AND thread_id IS NOT NULL')
      .get(input.accountId, candidate) as { thread_id: string } | undefined
    if (row) return row.thread_id
  }

  const normalized = normalizeSubject(input.subject)
  if (normalized) {
    const existingThread = db
      .prepare(
        `SELECT id FROM threads WHERE account_id = ? AND root_subject_normalized = ?
         ORDER BY last_message_at DESC LIMIT 1`
      )
      .get(input.accountId, normalized) as { id: string } | undefined
    if (existingThread) return existingThread.id
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO threads (id, account_id, root_subject_normalized, message_count, last_message_at, has_unread)
     VALUES (?, ?, ?, 0, ?, 0)`
  ).run(id, input.accountId, normalized, input.dateReceived)
  return id
}

export function touchThread(db: Database.Database, threadId: string): void {
  const stats = db
    .prepare(
      `SELECT COUNT(*) as count, MAX(date_received) as lastAt, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
       FROM messages WHERE thread_id = ? AND deleted_locally = 0`
    )
    .get(threadId) as { count: number; lastAt: string | null; unread: number }

  db.prepare('UPDATE threads SET message_count = ?, last_message_at = ?, has_unread = ? WHERE id = ?').run(
    stats.count,
    stats.lastAt,
    stats.unread > 0 ? 1 : 0,
    threadId
  )
}
