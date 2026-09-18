import { BrowserWindow, Notification } from 'electron'
import log from 'electron-log'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { SyncResult } from '@shared/ipc'
import {
  listDuePending,
  markScheduledFailedOrRetry,
  markScheduledFailedStale,
  markScheduledSent
} from './scheduled-repository'
import { listDueSnoozed, wakeSnoozed } from '../mail/snoozed-repository'
import { listDueFollowUps, markFollowUpNotified } from '../mail/follow-ups-repository'
import { sendMessage } from '../smtp/send-message'
import { listAccountsForAutoSync } from '../mail/accounts-repository'
import { syncAccount } from '../mail/sync-engine'
import { getSetting } from '../settings/settings-repository'
import { mt } from '../i18n'

const NOTIFY_NEW_MAIL_SETTING_KEY = 'notifyNewMail'

const TICK_INTERVAL_MS = 30_000
const STALE_SCHEDULE_THRESHOLD_MS = 24 * 3600_000
const MIN_AUTO_SYNC_INTERVAL_MS = 60_000

let timer: ReturnType<typeof setInterval> | null = null
let autoSyncRunning = false
const lastAutoSyncAt = new Map<string, number>()

/** Automatyczna, cykliczna synchronizacja IMAP wszystkich kont wg ich sync_frequency_sec
 * (domyślnie 5 min, ustawiane per konto w bazie). Wyniki wypychane do renderera, żeby UI
 * odświeżył listę folderów/wiadomości bez ręcznej akcji użytkownika. */
async function processAutoSync(db: Database.Database): Promise<void> {
  if (autoSyncRunning) return
  const autoSyncEnabled = getSetting(db, 'autoSyncEnabled') !== 'false'
  if (!autoSyncEnabled) return

  autoSyncRunning = true
  try {
    const now = Date.now()
    const accounts = listAccountsForAutoSync(db)
    const results: SyncResult[] = []
    const notifyEnabled = getSetting(db, NOTIFY_NEW_MAIL_SETTING_KEY) !== 'false'
    const notifyDesktop = getSetting(db, 'notifyDesktop') !== 'false'
    for (const acc of accounts) {
      const intervalMs = Math.max(acc.syncFrequencySec * 1000, MIN_AUTO_SYNC_INTERVAL_MS)
      const last = lastAutoSyncAt.get(acc.id) ?? 0
      if (now - last < intervalMs) continue
      const isFirstSyncThisSession = !lastAutoSyncAt.has(acc.id)
      try {
        const result = await syncAccount(db, acc.id)
        results.push(result)
        if (notifyEnabled && notifyDesktop && !isFirstSyncThisSession && result.status === 'active' && result.newMessages > 0) {
          new Notification({
            title: mt('notifyNewMailTitle'),
            body: result.newMessages === 1
              ? mt('notifyNewMailBodySingle')
              : mt('notifyNewMailBodyPlural', { count: result.newMessages })
          }).show()
        }
      } catch (err) {
        log.error('[scheduler] auto-sync konta nieudany', acc.id, err)
      } finally {
        lastAutoSyncAt.set(acc.id, Date.now())
      }
    }
    if (results.length > 0) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('sync:auto-completed', results)
      }
    }
  } finally {
    autoSyncRunning = false
  }
}

async function processScheduledSends(db: Database.Database): Promise<void> {
  const now = new Date()
  for (const item of listDuePending(db, now.toISOString())) {
    const age = now.getTime() - new Date(item.sendAt).getTime()
    if (age > STALE_SCHEDULE_THRESHOLD_MS) {
      // Plan 7.10: nie wysyłaj automatycznie czegoś zaplanowanego sprzed >24h bez
      // potwierdzenia użytkownika — ochrona przed wysłaniem nieaktualnej wiadomości
      // po długiej przerwie (np. laptop wyłączony przez tydzień).
      markScheduledFailedStale(db, item.id)
      continue
    }
    try {
      await sendMessage(db, item.payload)
      markScheduledSent(db, item.id)
    } catch (err) {
      const failed = markScheduledFailedOrRetry(db, item.id, (err as Error).message)
      log.error('[scheduler] wysyłka zaplanowanej wiadomości nieudana', item.id, err)
      if (failed) {
        new Notification({
          title: 'Nie udało się wysłać wiadomości',
          body: item.payload.subject || '(brak tematu)'
        }).show()
      }
    }
  }
}

function processSnoozed(db: Database.Database): void {
  const now = new Date().toISOString()
  for (const item of listDueSnoozed(db, now)) {
    wakeSnoozed(db, item.snoozedId, item.messageId)
    new Notification({ title: 'Przypomnienie', body: item.subject || '(brak tematu)' }).show()
  }
}

function processFollowUps(db: Database.Database): void {
  const now = new Date().toISOString()
  for (const item of listDueFollowUps(db, now)) {
    markFollowUpNotified(db, item.id)
    new Notification({ title: 'Brak odpowiedzi', body: item.subject || '(brak tematu)' }).show()
  }
}

async function tick(db: Database.Database): Promise<void> {
  try {
    await processScheduledSends(db)
    processSnoozed(db)
    processFollowUps(db)
    await processAutoSync(db)
  } catch (err) {
    log.error('[scheduler] tick nieudany', err)
  }
}

/** Jeden silnik pod trzy funkcje (send later / snooze / follow-up) — plan 7.10/7.15/9.1. */
export function startScheduler(db: Database.Database): void {
  if (timer) return
  tick(db)
  timer = setInterval(() => tick(db), TICK_INTERVAL_MS)
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
