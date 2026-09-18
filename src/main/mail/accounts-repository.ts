import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { AccountSecurity, AccountSummary, CreateAccountInput, UpdateAccountInput } from '@shared/ipc'
import { deleteAccountSecret, getAccountSecret, saveAccountSecret } from '../security/secrets'

export interface AccountConnectionInfo {
  id: string
  email: string
  imapHost: string
  imapPort: number
  imapSecurity: AccountSecurity
  smtpHost: string
  smtpPort: number
  smtpSecurity: AccountSecurity
  password: string
}

export async function getAccountConnectionInfo(db: Database.Database, accountId: string): Promise<AccountConnectionInfo> {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as AccountRow & { credential_ref: string }
  if (!row) throw new Error(`Konto ${accountId} nie istnieje`)
  const password = await getAccountSecret(row.credential_ref)
  if (password === null) throw new Error('Brak zapisanych danych logowania dla tego konta')
  return {
    id: row.id,
    email: row.email,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    imapSecurity: row.imap_security as AccountSecurity,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecurity: row.smtp_security as AccountSecurity,
    password
  }
}

export function setAccountStatus(db: Database.Database, accountId: string, status: 'active' | 'error' | 'disabled', lastError: string | null): void {
  db.prepare('UPDATE accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
    status,
    lastError,
    new Date().toISOString(),
    accountId
  )
}

interface AccountRow {
  id: string
  email: string
  display_name: string
  imap_host: string
  imap_port: number
  imap_security: string
  smtp_host: string
  smtp_port: number
  smtp_security: string
  auth_type: string
  is_default: number
  color: string
  status: string
  last_error: string | null
  created_at: string
}

function toSummary(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    imapSecurity: row.imap_security as AccountSummary['imapSecurity'],
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecurity: row.smtp_security as AccountSummary['smtpSecurity'],
    authType: row.auth_type as AccountSummary['authType'],
    isDefault: Boolean(row.is_default),
    color: row.color,
    status: row.status as AccountSummary['status'],
    lastError: row.last_error,
    createdAt: row.created_at
  }
}

export function listAccounts(db: Database.Database): AccountSummary[] {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as AccountRow[]
  return rows.map(toSummary)
}

export async function createAccount(db: Database.Database, input: CreateAccountInput): Promise<AccountSummary> {
  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(input.email)
  if (existing) throw new Error(`Konto ${input.email} już istnieje`)

  const id = randomUUID()
  const credentialRef = `account:${id}`
  const now = new Date().toISOString()
  const isFirstAccount = (db.prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number }).c === 0

  await saveAccountSecret(credentialRef, input.password)

  db.prepare(
    `INSERT INTO accounts (
      id, email, display_name, imap_host, imap_port, imap_security,
      smtp_host, smtp_port, smtp_security, auth_type, credential_ref,
      is_default, sync_frequency_sec, idle_enabled, color, created_at, updated_at, status
    ) VALUES (@id, @email, @displayName, @imapHost, @imapPort, @imapSecurity,
      @smtpHost, @smtpPort, @smtpSecurity, @authType, @credentialRef,
      @isDefault, 300, 1, @color, @createdAt, @createdAt, 'active')`
  ).run({
    id,
    email: input.email,
    displayName: input.displayName,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapSecurity: input.imapSecurity,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecurity: input.smtpSecurity,
    authType: input.authType,
    credentialRef,
    isDefault: isFirstAccount ? 1 : 0,
    color: input.color,
    createdAt: now
  })

  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow
  return toSummary(row)
}

export async function deleteAccount(db: Database.Database, accountId: string): Promise<void> {
  const row = db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId) as { id: string } | undefined
  if (!row) return
  await deleteAccountSecret(`account:${accountId}`)
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
}

export function updateAccount(db: Database.Database, accountId: string, input: UpdateAccountInput): AccountSummary {
  const sets: string[] = []
  const values: unknown[] = []
  if (input.displayName !== undefined) { sets.push('display_name = ?'); values.push(input.displayName) }
  if (input.imapHost !== undefined) { sets.push('imap_host = ?'); values.push(input.imapHost) }
  if (input.imapPort !== undefined) { sets.push('imap_port = ?'); values.push(input.imapPort) }
  if (input.imapSecurity !== undefined) { sets.push('imap_security = ?'); values.push(input.imapSecurity) }
  if (input.smtpHost !== undefined) { sets.push('smtp_host = ?'); values.push(input.smtpHost) }
  if (input.smtpPort !== undefined) { sets.push('smtp_port = ?'); values.push(input.smtpPort) }
  if (input.smtpSecurity !== undefined) { sets.push('smtp_security = ?'); values.push(input.smtpSecurity) }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(accountId)
    db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as AccountRow
  return toSummary(row)
}

export async function updateAccountCredential(db: Database.Database, accountId: string, password: string): Promise<void> {
  const row = db.prepare('SELECT credential_ref as credentialRef FROM accounts WHERE id = ?').get(accountId) as
    | { credentialRef: string }
    | undefined
  if (!row) throw new Error(`Konto ${accountId} nie istnieje`)
  await saveAccountSecret(row.credentialRef, password)
}

export function setDefaultAccount(db: Database.Database, accountId: string): void {
  const setDefault = db.transaction(() => {
    db.prepare('UPDATE accounts SET is_default = 0').run()
    db.prepare('UPDATE accounts SET is_default = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), accountId)
  })
  setDefault()
}

export function listAccountsForAutoSync(db: Database.Database): { id: string; syncFrequencySec: number }[] {
  const rows = db.prepare('SELECT id, sync_frequency_sec as syncFrequencySec FROM accounts').all() as {
    id: string
    syncFrequencySec: number
  }[]
  return rows
}
