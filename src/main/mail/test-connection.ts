import { lookup } from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import type { TestConnectionInput, TestConnectionStep } from '@shared/ipc'

interface TimedTcpResult {
  tcpMs: number
  tlsCipher?: string
  tlsVersion?: string
  certSubject?: string
  certIssuer?: string
  certValidFrom?: string
  certValidTo?: string
}

function connectTcp(host: string, port: number, timeoutMs = 10000): Promise<TimedTcpResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Przekroczono limit czasu połączenia TCP'))
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      const tcpMs = Date.now() - start
      socket.end()
      resolve({ tcpMs })
    })
    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function connectTls(host: string, port: number, timeoutMs = 10000): Promise<TimedTcpResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const socket = tls.connect({ host, port, servername: host }, () => {
      if (!socket.authorized) {
        socket.destroy()
        reject(new Error(socket.authorizationError?.toString() ?? 'Certyfikat niezaufany'))
        return
      }
      const tlsCipher = socket.getCipher()
      const cert = socket.getPeerCertificate(true)
      const tlsMs = Date.now() - start
      socket.end()
      const toCn = (cn: string | string[] | undefined): string | undefined => (Array.isArray(cn) ? cn[0] : cn)
      resolve({
        tcpMs: tlsMs,
        tlsCipher: tlsCipher?.name,
        tlsVersion: tlsCipher?.version,
        certSubject: toCn(cert.subject?.CN),
        certIssuer: toCn(cert.issuer?.CN),
        certValidFrom: cert.valid_from,
        certValidTo: cert.valid_to
      })
    })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Przekroczono limit czasu handshake TLS'))
    }, timeoutMs)
    socket.once('secureConnect', () => clearTimeout(timer))
    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function connectSmtpStartTls(host: string, port: number, timeoutMs = 10000): Promise<TimedTcpResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const socket = net.connect({ host, port })
    socket.setEncoding('utf8')
    let buffer = ''
    let sentEhlo = false
    let sentStartTls = false

    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Przekroczono limit czasu negocjacji STARTTLS SMTP'))
    }, timeoutMs)

    function cleanup(): void {
      clearTimeout(timer)
      socket.removeAllListeners('data')
      socket.removeAllListeners('error')
    }

    socket.on('data', (chunk) => {
      buffer += chunk
      if (!sentEhlo && buffer.includes('220')) {
        sentEhlo = true
        buffer = ''
        socket.write('EHLO localhost\r\n')
      } else if (sentEhlo && !sentStartTls && buffer.includes('250')) {
        if (!/250[ -]STARTTLS/i.test(buffer)) {
          cleanup()
          socket.destroy()
          reject(new Error('Serwer SMTP nie ogłasza obsługi STARTTLS'))
          return
        }
        sentStartTls = true
        buffer = ''
        socket.write('STARTTLS\r\n')
      } else if (sentStartTls && buffer.includes('220')) {
        cleanup()
        const tlsSocket = tls.connect({ socket, servername: host }, () => {
          const tlsMs = Date.now() - start
          const tlsCipher = tlsSocket.getCipher()
          const cert = tlsSocket.getPeerCertificate(true)
          tlsSocket.end()
          const toCn = (cn: string | string[] | undefined): string | undefined => (Array.isArray(cn) ? cn[0] : cn)
          resolve({
            tcpMs: tlsMs,
            tlsCipher: tlsCipher?.name,
            tlsVersion: tlsCipher?.version,
            certSubject: toCn(cert.subject?.CN),
            certIssuer: toCn(cert.issuer?.CN),
            certValidFrom: cert.valid_from,
            certValidTo: cert.valid_to
          })
        })
        tlsSocket.once('error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
      }
    })

    socket.once('error', (err) => {
      cleanup()
      reject(err)
    })
  })
}

function connectImapStartTls(host: string, port: number, timeoutMs = 10000): Promise<TimedTcpResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const socket = net.connect({ host, port })
    socket.setEncoding('utf8')
    let buffer = ''
    let sentStartTls = false

    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Przekroczono limit czasu negocjacji STARTTLS IMAP'))
    }, timeoutMs)

    function cleanup(): void {
      clearTimeout(timer)
      socket.removeAllListeners('data')
      socket.removeAllListeners('error')
    }

    socket.on('data', (chunk) => {
      buffer += chunk
      if (!sentStartTls && buffer.includes('* OK')) {
        sentStartTls = true
        buffer = ''
        socket.write('A001 STARTTLS\r\n')
      } else if (sentStartTls && buffer.includes('A001 OK')) {
        cleanup()
        const tlsSocket = tls.connect({ socket, servername: host }, () => {
          const tlsMs = Date.now() - start
          const tlsCipher = tlsSocket.getCipher()
          const cert = tlsSocket.getPeerCertificate(true)
          tlsSocket.end()
          const toCn = (cn: string | string[] | undefined): string | undefined => (Array.isArray(cn) ? cn[0] : cn)
          resolve({
            tcpMs: tlsMs,
            tlsCipher: tlsCipher?.name,
            tlsVersion: tlsCipher?.version,
            certSubject: toCn(cert.subject?.CN),
            certIssuer: toCn(cert.issuer?.CN),
            certValidFrom: cert.valid_from,
            certValidTo: cert.valid_to
          })
        })
        tlsSocket.once('error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
      } else if (sentStartTls && (buffer.includes('A001 NO') || buffer.includes('A001 BAD'))) {
        cleanup()
        socket.destroy()
        reject(new Error('Serwer IMAP odrzucił komendę STARTTLS'))
      }
    })

    socket.once('error', (err) => {
      cleanup()
      reject(err)
    })
  })
}

function formatAuthError(err: unknown, input: TestConnectionInput): string {
  const e = err as { message?: string; response?: string; responseText?: string; authenticationFailed?: boolean }
  const raw = [e?.message, e?.response, e?.responseText].filter(Boolean).join(' ') || String(err)
  const isGmail = /gmail|googlemail/i.test(input.host) || /@(gmail|googlemail)\.com$/i.test(input.email)
  if (isGmail) {
    if (e?.authenticationFailed || /535|BadCredentials|AUTHENTICATIONFAILED|Invalid credentials|Application-specific|Command failed/i.test(raw)) {
      return 'Google wymaga 16-znakowego Hasła do aplikacji (App Password) zamiast zwykłego hasła do konta. Wygeneruj je w ustawieniach Google: myaccount.google.com/apppasswords'
    }
  }
  return e?.response || e?.message || raw
}

async function testAuth(input: TestConnectionInput): Promise<void> {
  if (input.protocol === 'imap') {
    const client = new ImapFlow({
      host: input.host,
      port: input.port,
      secure: input.security === 'ssl',
      auth: { user: input.email, pass: input.password },
      logger: false
    })
    await client.connect()
    await client.logout()
  } else {
    const transporter = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.security === 'ssl',
      requireTLS: input.security === 'starttls',
      auth: { user: input.email, pass: input.password }
    })
    await transporter.verify()
  }
}

export async function runConnectionDiagnostics(input: TestConnectionInput): Promise<TestConnectionStep[]> {
  const steps: TestConnectionStep[] = []

  try {
    const dnsStart = Date.now()
    await lookup(input.host)
    const dnsMs = Date.now() - dnsStart
    steps.push({ step: 'dns', ok: true, message: `Rozwiązano host ${input.host} (${dnsMs} ms)` })
  } catch (err) {
    steps.push({ step: 'dns', ok: false, message: (err as Error).message })
    return steps
  }

  let tcpResult: TimedTcpResult | null = null

  try {
    tcpResult = await connectTcp(input.host, input.port)
    steps.push({ step: 'tcp', ok: true, message: `Połączono TCP na porcie ${input.port} (${tcpResult.tcpMs} ms)` })
  } catch (err) {
    steps.push({ step: 'tcp', ok: false, message: (err as Error).message })
    return steps
  }

  if (input.security === 'ssl') {
    try {
      tcpResult = await connectTls(input.host, input.port)
      const cipher = tcpResult.tlsCipher ? ` (${tcpResult.tlsCipher})` : ''
      steps.push({ step: 'tls', ok: true, message: `Uzgodniono TLS${cipher}, certyfikat zaufany (${tcpResult.tcpMs} ms)` })
    } catch (err) {
      steps.push({ step: 'tls', ok: false, message: (err as Error).message })
      return steps
    }
  } else if (input.security === 'starttls') {
    try {
      tcpResult =
        input.protocol === 'smtp'
          ? await connectSmtpStartTls(input.host, input.port)
          : await connectImapStartTls(input.host, input.port)
      const cipher = tcpResult.tlsCipher ? ` (${tcpResult.tlsCipher})` : ''
      steps.push({ step: 'tls', ok: true, message: `Uzgodniono STARTTLS${cipher}, certyfikat zaufany (${tcpResult.tcpMs} ms)` })
    } catch (err) {
      steps.push({ step: 'tls', ok: false, message: (err as Error).message })
      return steps
    }
  }

  try {
    await testAuth(input)
    steps.push({ step: 'auth', ok: true, message: 'Uwierzytelnienie powiodło się' })
  } catch (err) {
    steps.push({ step: 'auth', ok: false, message: formatAuthError(err, input) })
  }

  return steps
}

export function getTlsConnectionInfo(input: TestConnectionInput): Promise<TimedTcpResult> {
  if (input.security === 'starttls') {
    return input.protocol === 'smtp'
      ? connectSmtpStartTls(input.host, input.port, 10000)
      : connectImapStartTls(input.host, input.port, 10000)
  }
  return connectTls(input.host, input.port, 10000)
}
