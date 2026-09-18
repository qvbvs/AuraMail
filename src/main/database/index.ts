import Database from 'better-sqlite3-multiple-ciphers'
import { app } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { getOrCreateDbKey } from '../security/secrets'
import { migrate } from './schema'

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance

  const userDataPath = app.getPath('userData')
  const oldDbPath = join(userDataPath, 'mailapp.db')
  const newDbPath = join(userDataPath, 'auramail.db')

  if (!existsSync(newDbPath) && existsSync(oldDbPath)) {
    try {
      renameSync(oldDbPath, newDbPath)
      if (existsSync(`${oldDbPath}-wal`)) renameSync(`${oldDbPath}-wal`, `${newDbPath}-wal`)
      if (existsSync(`${oldDbPath}-shm`)) renameSync(`${oldDbPath}-shm`, `${newDbPath}-shm`)
    } catch {
      // fallback
    }
  }

  const dbPath = existsSync(newDbPath) ? newDbPath : oldDbPath
  const key = getOrCreateDbKey(userDataPath)

  const db = new Database(dbPath)
  db.pragma(`cipher='sqlcipher'`)
  db.key(Buffer.from(key, 'utf8'))
  db.pragma('journal_mode = WAL')

  migrate(db)

  dbInstance = db
  return db
}

export function closeDb(): void {
  dbInstance?.close()
  dbInstance = null
}
