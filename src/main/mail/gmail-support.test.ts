import { describe, it, expect } from 'vitest'
import { guessFolderType } from './folders-repository'
import { runConnectionDiagnostics } from './test-connection'

describe('Gmail folder resolution', () => {
  it('identifies \\All as archive', () => {
    expect(guessFolderType('[Gmail]/All Mail', '\\All')).toBe('archive')
  })

  it('identifies Polish All Mail folder as archive', () => {
    expect(guessFolderType('[Gmail]/Wszystkie', undefined)).toBe('archive')
    expect(guessFolderType('Wszystkie wiadomości', undefined)).toBe('archive')
  })

  it('identifies Sent Mail folder correctly', () => {
    expect(guessFolderType('[Gmail]/Sent Mail', '\\Sent')).toBe('sent')
    expect(guessFolderType('[Gmail]/Wysłane', undefined)).toBe('sent')
  })

  it('identifies non-special folders', () => {
    expect(guessFolderType('[Gmail]', undefined)).toBe('custom')
  })
})

describe('Gmail diagnostics (network integration)', () => {
  it('correctly negotiates STARTTLS on smtp.gmail.com:587 and hints App Password', async () => {
    const steps = await runConnectionDiagnostics({
      host: 'smtp.gmail.com',
      port: 587,
      security: 'starttls',
      protocol: 'smtp',
      email: 'test@gmail.com',
      password: 'invalid-password'
    })

    const dnsStep = steps.find((s) => s.step === 'dns')
    const tcpStep = steps.find((s) => s.step === 'tcp')
    const tlsStep = steps.find((s) => s.step === 'tls')
    const authStep = steps.find((s) => s.step === 'auth')

    expect(dnsStep?.ok).toBe(true)
    expect(tcpStep?.ok).toBe(true)
    expect(tlsStep?.ok).toBe(true)
    expect(tlsStep?.message).toContain('STARTTLS')
    expect(authStep?.ok).toBe(false)
    expect(authStep?.message).toContain('Hasła do aplikacji')
  }, 15000)

  it('correctly negotiates TLS on imap.gmail.com:993 and hints App Password', async () => {
    const steps = await runConnectionDiagnostics({
      host: 'imap.gmail.com',
      port: 993,
      security: 'ssl',
      protocol: 'imap',
      email: 'test@gmail.com',
      password: 'invalid-password'
    })

    const dnsStep = steps.find((s) => s.step === 'dns')
    const tcpStep = steps.find((s) => s.step === 'tcp')
    const tlsStep = steps.find((s) => s.step === 'tls')
    const authStep = steps.find((s) => s.step === 'auth')

    expect(dnsStep?.ok).toBe(true)
    expect(tcpStep?.ok).toBe(true)
    expect(tlsStep?.ok).toBe(true)
    expect(tlsStep?.message).toContain('TLS')
    expect(authStep?.ok).toBe(false)
    expect(authStep?.message).toContain('Hasła do aplikacji')
  }, 15000)
})
