import { app } from 'electron'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { LoginItemPrefs } from '@shared/ipc'
import { getSetting, setSetting } from '../settings/settings-repository'

// Argument rozpoznawany przy starcie procesu uruchomionego przez system (autostart) —
// gdy obecny, okno główne nie jest pokazywane i aplikacja zostaje wyłącznie w tray'u.
export const START_MINIMIZED_ARG = '--start-minimized'

export function getLoginItemPrefs(db: Database.Database): LoginItemPrefs {
  return {
    openAtLogin: getSetting(db, 'launchAtLogin') === '1',
    startMinimized: getSetting(db, 'launchMinimized') === '1'
  }
}

// Zapisuje preferencję w DB i synchronizuje ją z rejestrem autostartu systemu
// (Rejestr > Run na Windows, LaunchAgents na macOS, autostart .desktop na Linuksie).
export function applyLoginItemPrefs(db: Database.Database, prefs: LoginItemPrefs): void {
  setSetting(db, 'launchAtLogin', prefs.openAtLogin ? '1' : '0')
  setSetting(db, 'launchMinimized', prefs.startMinimized ? '1' : '0')

  const startHidden = prefs.openAtLogin && prefs.startMinimized

  app.setLoginItemSettings({
    openAtLogin: prefs.openAtLogin,
    // 'openAsHidden' działa tylko na macOS — na Windows/Linux ukrycie okna
    // realizujemy sami po stronie renderera przez flagę startową w `args`.
    openAsHidden: startHidden,
    path: process.execPath,
    args: startHidden ? [START_MINIMIZED_ARG] : []
  })
}

// Ponownie stosuje zapisaną preferencję na starcie aplikacji — potrzebne m.in. po
// aktualizacji, gdy `process.execPath` mógł się zmienić (instalator zapisuje nową ścieżkę).
export function syncLoginItemSettings(db: Database.Database): void {
  applyLoginItemPrefs(db, getLoginItemPrefs(db))
}
