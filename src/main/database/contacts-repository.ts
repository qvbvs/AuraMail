import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { ContactSummary, SaveContactInput, SaveContactResult } from '@shared/ipc'

const CONTACTS_SELECT = `
  SELECT c.id, c.first_name AS firstName, c.last_name AS lastName,
         COALESCE(c.company, '') AS company, COALESCE(c.notes, '') AS notes,
         COALESCE((SELECT email FROM contact_emails WHERE contact_id = c.id ORDER BY is_primary DESC, rowid LIMIT 1), '') AS email,
         COALESCE((SELECT phone FROM contact_phones WHERE contact_id = c.id ORDER BY rowid LIMIT 1), '') AS phone
  FROM contacts c
`

export function listContacts(db: Database.Database): ContactSummary[] {
  return db.prepare(CONTACTS_SELECT).all() as ContactSummary[]
}

export function saveContact(db: Database.Database, input: SaveContactInput): SaveContactResult {
  return db.transaction((): SaveContactResult => {
    const { firstName, lastName, email, company, phone, notes } = input
    const id = input.id ?? randomUUID()
    const duplicate = db.prepare(`
      SELECT 1 FROM contact_emails WHERE email = ? COLLATE NOCASE AND contact_id <> ? LIMIT 1
    `).get(email, id)
    if (duplicate) return { ok: false, reason: 'duplicate_email' }

    const now = new Date().toISOString()
    if (input.id) {
      const update = db.prepare(`
        UPDATE contacts SET first_name = ?, last_name = ?, company = ?, notes = ?, updated_at = ? WHERE id = ?
      `).run(firstName, lastName, company, notes, now, id)
      if (update.changes === 0) throw new Error('Contact no longer exists')
    } else {
      db.prepare(`
        INSERT INTO contacts (id, first_name, last_name, company, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, firstName, lastName, company, notes, now, now)
    }

    const emailRow = db.prepare(`
      SELECT id FROM contact_emails WHERE contact_id = ?
      ORDER BY (email = ? COLLATE NOCASE) DESC, is_primary DESC, rowid LIMIT 1
    `).get(id, email) as { id: string } | undefined
    if (emailRow) {
      db.prepare('UPDATE contact_emails SET is_primary = 0 WHERE contact_id = ? AND is_primary = 1').run(id)
      db.prepare('UPDATE contact_emails SET email = ?, is_primary = 1 WHERE id = ?').run(email, emailRow.id)
    } else {
      db.prepare('INSERT INTO contact_emails (id, contact_id, email, is_primary) VALUES (?, ?, ?, 1)').run(randomUUID(), id, email)
    }

    const phoneRow = db.prepare('SELECT id FROM contact_phones WHERE contact_id = ? ORDER BY rowid LIMIT 1').get(id) as { id: string } | undefined
    if (phone && phoneRow) {
      db.prepare('UPDATE contact_phones SET phone = ? WHERE id = ?').run(phone, phoneRow.id)
    } else if (phone) {
      db.prepare('INSERT INTO contact_phones (id, contact_id, phone) VALUES (?, ?, ?)').run(randomUUID(), id, phone)
    } else if (phoneRow) {
      db.prepare('DELETE FROM contact_phones WHERE id = ?').run(phoneRow.id)
    }

    const contact = db.prepare(`${CONTACTS_SELECT} WHERE c.id = ?`).get(id) as ContactSummary
    return { ok: true, contact }
  }).immediate()
}

export function deleteContact(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
}
