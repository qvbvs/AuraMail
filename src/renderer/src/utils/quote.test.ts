import { describe, expect, it } from 'vitest'
import { escapeHtml, prefixSubject, textToHtml } from './quote'

describe('quote helpers', () => {
  it('prefixes subjects once', () => {
    expect(prefixSubject('Re', 'Hello')).toBe('Re: Hello')
    expect(prefixSubject('Re', 'RE: Hello')).toBe('RE: Hello')
    expect(prefixSubject('Fwd', 'Fw: Hello')).toBe('Fw: Hello')
    expect(prefixSubject('Fwd', 'Hello')).toBe('Fwd: Hello')
  })

  it('escapes and paragraphs plain text', () => {
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
    expect(textToHtml('one\ntwo\n\n<three>')).toBe('<p>one<br>two</p><p>&lt;three&gt;</p>')
  })
})
