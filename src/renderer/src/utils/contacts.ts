import type { ContactFields } from '@shared/ipc'

export const emptyContact: ContactFields = { firstName: '', lastName: '', email: '', company: '', phone: '', notes: '' }

export function contactName(contact: ContactFields): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ')
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l')
}

export function contactMatches(contact: ContactFields, query: string): boolean {
  const details = normalizeSearch([contactName(contact), contact.email, contact.company, contact.phone].join(' '))
  return normalizeSearch(query.trim()).split(/\s+/).every((word) => details.includes(word))
}
