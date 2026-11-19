import DOMPurify from 'dompurify'
import type { MessageDetail } from '@shared/ipc'

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Plain text typed by the user → paragraphs with line breaks. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Adds "Re:"/"Fwd:" once, ignoring existing (case-insensitive) prefixes. */
export function prefixSubject(prefix: 'Re' | 'Fwd', subject: string): string {
  const s = subject.trim()
  const re = prefix === 'Re' ? /^re:\s*/i : /^(fwd?|pd):\s*/i
  return re.test(s) ? s : `${prefix}: ${s}`
}

/** Attribution line + original body as a sanitized blockquote, for replies. */
export function buildQuote(detail: MessageDetail, header: string): string {
  const original = detail.bodyHtml
    ? DOMPurify.sanitize(detail.bodyHtml, { FORBID_TAGS: ['style', 'script', 'iframe', 'img', 'form', 'link', 'base'] })
    : textToHtml(detail.bodyPlain ?? '')
  return `<p></p><p>${escapeHtml(header)}</p><blockquote>${original}</blockquote>`
}
