import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type { CreateMailRuleInput, MailRule, MailRuleConditionField } from '@shared/ipc'

interface RuleRow {
  id: string
  account_id: string
  name: string
  conditions_json: string
  actions_json: string
  is_active: number
}

interface ConditionShape {
  field: MailRuleConditionField
  contains: string
}

interface ActionShape {
  type: 'move'
  folderId: string
}

function toMailRule(row: RuleRow): MailRule {
  const condition = JSON.parse(row.conditions_json) as ConditionShape
  const action = JSON.parse(row.actions_json) as ActionShape
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    conditionField: condition.field,
    conditionContains: condition.contains,
    actionMoveToFolderId: action.folderId,
    isActive: Boolean(row.is_active)
  }
}

export function listRules(db: Database.Database, accountId: string): MailRule[] {
  const rows = db
    .prepare('SELECT * FROM rules WHERE account_id = ? ORDER BY sort_order ASC')
    .all(accountId) as RuleRow[]
  return rows.map(toMailRule)
}

export function createRule(db: Database.Database, input: CreateMailRuleInput): MailRule {
  const id = randomUUID()
  const condition: ConditionShape = { field: input.conditionField, contains: input.conditionContains }
  const action: ActionShape = { type: 'move', folderId: input.actionMoveToFolderId }
  const sortOrder = (db.prepare('SELECT COUNT(*) as c FROM rules WHERE account_id = ?').get(input.accountId) as { c: number }).c
  db.prepare(
    `INSERT INTO rules (id, account_id, name, conditions_json, actions_json, is_active, sort_order, applies_on)
     VALUES (?, ?, ?, ?, ?, 1, ?, 'incoming')`
  ).run(id, input.accountId, input.name, JSON.stringify(condition), JSON.stringify(action), sortOrder)
  return {
    id,
    accountId: input.accountId,
    name: input.name,
    conditionField: input.conditionField,
    conditionContains: input.conditionContains,
    actionMoveToFolderId: input.actionMoveToFolderId,
    isActive: true
  }
}

export function setRuleActive(db: Database.Database, id: string, isActive: boolean): void {
  db.prepare('UPDATE rules SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
}

export function deleteRule(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM rules WHERE id = ?').run(id)
}

/** Aktywne reguły "incoming" dla konta — używane przy syncu nowej poczty w INBOX. */
export function listActiveIncomingRules(db: Database.Database, accountId: string): MailRule[] {
  const rows = db
    .prepare(`SELECT * FROM rules WHERE account_id = ? AND is_active = 1 AND applies_on = 'incoming' ORDER BY sort_order ASC`)
    .all(accountId) as RuleRow[]
  return rows.map(toMailRule)
}

export function matchRule(rule: MailRule, message: { fromAddr: string; fromName: string; subject: string }): boolean {
  const needle = rule.conditionContains.toLowerCase()
  if (!needle) return false
  if (rule.conditionField === 'from') {
    return message.fromAddr.toLowerCase().includes(needle) || message.fromName.toLowerCase().includes(needle)
  }
  return message.subject.toLowerCase().includes(needle)
}
