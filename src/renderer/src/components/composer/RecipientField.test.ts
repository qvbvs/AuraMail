import { describe, expect, it } from 'vitest'
import { isValidEmail, splitAddresses } from './RecipientField'

describe('recipient parsing', () => {
  it('splits on comma, semicolon and whitespace and strips angle brackets', () => {
    expect(splitAddresses('a@x.pl, b@y.com; <c@z.io>  d@w.eu')).toEqual(['a@x.pl', 'b@y.com', 'c@z.io', 'd@w.eu'])
    expect(splitAddresses(' , ;')).toEqual([])
    expect(splitAddresses('Jan Kowalski <jan@x.pl>, Ola <ola@y.pl>')).toEqual(['jan@x.pl', 'ola@y.pl'])
  })

  it('flags obvious typos', () => {
    expect(isValidEmail('jan.kowalski@nordlab.pl')).toBe(true)
    expect(isValidEmail('jan@nordlab')).toBe(false)
    expect(isValidEmail('jan.nordlab.pl')).toBe(false)
    expect(isValidEmail('jan@@x.pl')).toBe(false)
  })
})
