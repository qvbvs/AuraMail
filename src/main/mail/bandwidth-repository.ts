import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { BandwidthOperation, BandwidthPoint } from '@shared/ipc'

export interface RecordBandwidthInput {
  accountId: string
  folderId?: string | null
  operation: BandwidthOperation
  bytesTransferred: number
  durationMs: number
}

/** Zapisuje realny transfer sieciowy (rozmiar pobranych/wysłanych bajtów IMAP/SMTP,
 * zmierzony czas trwania) — źródło danych dla wykresu przepustowości w Ustawieniach. */
export function recordBandwidth(db: Database.Database, input: RecordBandwidthInput): void {
  if (input.bytesTransferred <= 0) return
  db.prepare(
    `INSERT INTO bandwidth_stats (id, account_id, folder_id, operation, bytes_transferred, duration_ms, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    input.accountId,
    input.folderId ?? null,
    input.operation,
    Math.round(input.bytesTransferred),
    Math.max(1, Math.round(input.durationMs)),
    new Date().toISOString()
  )
}

interface BandwidthRow {
  timestamp: string
  bytesTransferred: number
  durationMs: number
  operation: BandwidthOperation
}

/** Ostatnie N pomiarów transferu dla konta, w kolejności chronologicznej (do wykresu). */
export function listRecentBandwidth(db: Database.Database, accountId: string, limit = 20): BandwidthPoint[] {
  const rows = db
    .prepare(
      `SELECT timestamp, bytes_transferred as bytesTransferred, duration_ms as durationMs, operation
       FROM bandwidth_stats WHERE account_id = ? ORDER BY timestamp DESC LIMIT ?`
    )
    .all(accountId, limit) as BandwidthRow[]
  return rows.reverse().map((r) => ({
    timestamp: r.timestamp,
    bytesTransferred: r.bytesTransferred,
    durationMs: r.durationMs,
    kbps: (r.bytesTransferred / 1024) / (r.durationMs / 1000),
    operation: r.operation
  }))
}
