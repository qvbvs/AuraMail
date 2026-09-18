import { app } from 'electron'
import type Database from 'better-sqlite3-multiple-ciphers'
import { getSetting } from './settings/settings-repository'

export type MainLanguage = 'pl' | 'en'

let currentLanguage: MainLanguage = 'en'

export function initMainI18n(db?: Database.Database): MainLanguage {
  if (db) {
    try {
      const saved = getSetting(db, 'app_language')
      if (saved === 'pl' || saved === 'en') {
        currentLanguage = saved
        return currentLanguage
      }
    } catch {
      // fallback if DB not ready
    }
  }
  const sysLocale = app.getLocale() || ''
  currentLanguage = sysLocale.startsWith('pl') ? 'pl' : 'en'
  return currentLanguage
}

export function setMainLanguage(lang: MainLanguage): void {
  currentLanguage = lang
}

export function getMainLanguage(): MainLanguage {
  return currentLanguage
}

const strings = {
  pl: {
    trayOpen: 'Otwórz aplikację',
    trayCompose: 'Nowa wiadomość',
    trayInbox: 'Odebrane',
    traySearch: 'Szukaj',
    traySyncNow: 'Synchronizuj teraz',
    traySyncPause: 'Pauza synchronizacji',
    traySettings: 'Ustawienia',
    trayQuit: 'Wyjdź',
    notifyNewMessageTitle: 'Nowa wiadomość: {name}',
    notifyNewMessageDefaultSender: 'Nowy nadawca',
    notifyNewMessageDefaultBody: 'Odebrano nową wiadomość w skrzynce',
    notifyNewMailTitle: 'Nowa poczta',
    notifyNewMailBodySingle: '1 nowa wiadomość',
    notifyNewMailBodyPlural: '{count} nowych wiadomości',
    testDnsOk: 'Rozwiązano host {host} ({ms} ms)',
    testTcpOk: 'Połączono TCP na porcie {port} ({ms} ms)',
    testTlsOk: 'Uzgodniono TLS{cipher}, certyfikat zaufany ({ms} ms)',
    testStartTlsOk: 'Uzgodniono STARTTLS{cipher}, certyfikat zaufany ({ms} ms)',
    testAuthOk: 'Uwierzytelnienie powiodło się',
    testSmtpNoStartTls: 'Serwer SMTP nie ogłasza obsługi STARTTLS',
    testImapNoStartTls: 'Serwer IMAP odrzucił komendę STARTTLS',
    testGmailAppPass: 'Google wymaga 16-znakowego Hasła do aplikacji (App Password) zamiast zwykłego hasła do konta. Wygeneruj je w ustawieniach Google: myaccount.google.com/apppasswords'
  },
  en: {
    trayOpen: 'Open AuraMail',
    trayCompose: 'New Message',
    trayInbox: 'Inbox',
    traySearch: 'Search',
    traySyncNow: 'Sync Now',
    traySyncPause: 'Pause Sync',
    traySettings: 'Settings',
    trayQuit: 'Quit',
    notifyNewMessageTitle: 'New message: {name}',
    notifyNewMessageDefaultSender: 'New sender',
    notifyNewMessageDefaultBody: 'New message received in inbox',
    notifyNewMailTitle: 'New Mail',
    notifyNewMailBodySingle: '1 new message',
    notifyNewMailBodyPlural: '{count} new messages',
    testDnsOk: 'Resolved host {host} ({ms} ms)',
    testTcpOk: 'Connected TCP on port {port} ({ms} ms)',
    testTlsOk: 'Negotiated TLS{cipher}, certificate trusted ({ms} ms)',
    testStartTlsOk: 'Negotiated STARTTLS{cipher}, certificate trusted ({ms} ms)',
    testAuthOk: 'Authentication successful',
    testSmtpNoStartTls: 'SMTP server does not announce STARTTLS support',
    testImapNoStartTls: 'IMAP server rejected STARTTLS command',
    testGmailAppPass: 'Google requires a 16-character App Password instead of your regular account password. Generate one in your Google account settings: myaccount.google.com/apppasswords'
  }
}

export type MainI18nKey = keyof typeof strings['en']

export function mt(key: MainI18nKey, vars?: Record<string, string | number>): string {
  let str = strings[currentLanguage]?.[key] || strings['en'][key] || key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}
