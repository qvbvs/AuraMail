import type Database from 'better-sqlite3-multiple-ciphers'

/** Prosty magazyn klucz-wartość (tabela `settings`, plan sekcja 5) dla globalnych
 * preferencji aplikacji, np. czy pokazywać powiadomienia pulpitu o nowej poczcie. */
export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, scope) VALUES (?, ?, 'global')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}
