import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { pl } from './locales/pl'
import { en } from './locales/en'

export type Language = 'pl' | 'en'

export type TranslationKey = keyof typeof pl

export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary
}

const translations: Record<Language, Record<string, string>> = {
  pl,
  en
}

export interface LanguageContextValue {
  language: Language
  locale: string
  setLanguage: (lang: Language) => void
  t: (key: string, vars?: Record<string, string | number>, defaultText?: string) => string
  formatDate: (date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions) => string
  formatRelativeDate: (date: Date | string | number | null | undefined) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language') as Language | null
    if (saved === 'en' || saved === 'pl') return saved
    const navLang = typeof navigator !== 'undefined' ? navigator.language : 'pl'
    return navLang.startsWith('pl') ? 'pl' : 'en'
  })

  // Synchronizuj język z bazą SQLite
  useEffect(() => {
    async function loadFromDb(): Promise<void> {
      try {
        const dbLang = await window.mailapp?.settings?.get('app_language')
        if (dbLang === 'en' || dbLang === 'pl') {
          setLanguageState(dbLang)
          localStorage.setItem('app_language', dbLang)
        }
      } catch {
        // SQLite settings unavailable yet
      }
    }
    loadFromDb()
  }, [])

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang)
    localStorage.setItem('app_language', newLang)
    window.mailapp?.settings?.set('app_language', newLang).catch(() => {})
  }, [])

  useEffect(() => {
    ;(window as any).__setLanguage = setLanguage
  }, [setLanguage])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>, defaultText?: string): string => {
      let str = translations[language]?.[key] || translations.pl[key] || defaultText || key
      if (vars) {
        for (const [vKey, val] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${vKey}\\}`, 'g'), String(val))
        }
      }
      return str
    },
    [language]
  )

  const locale = language === 'pl' ? 'pl-PL' : 'en-US'

  const formatDate = useCallback(
    (date: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions): string => {
      if (!date) return ''
      const d = typeof date === 'object' ? date : new Date(date)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleDateString(locale, options)
    },
    [locale]
  )

  const formatRelativeDate = useCallback(
    (date: Date | string | number | null | undefined): string => {
      if (!date) return ''
      const d = typeof date === 'object' ? date : new Date(date)
      if (isNaN(d.getTime())) return ''
      const now = new Date()
      const sameDay = d.toDateString() === now.toDateString()
      if (sameDay) {
        return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      }
      const yesterday = new Date()
      yesterday.setDate(now.getDate() - 1)
      if (d.toDateString() === yesterday.toDateString()) {
        return t('time.yesterday', undefined, language === 'pl' ? 'Wczoraj' : 'Yesterday')
      }
      return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
    },
    [locale, language, t]
  )

  return (
    <LanguageContext.Provider
      value={{
        language,
        locale,
        setLanguage,
        t,
        formatDate,
        formatRelativeDate
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    return {
      language: 'pl',
      locale: 'pl-PL',
      setLanguage: () => {},
      t: (key, vars, defaultText) => {
        let str = translations.pl[key] || defaultText || key
        if (vars) {
          for (const [vKey, val] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${vKey}\\}`, 'g'), String(val))
          }
        }
        return str
      },
      formatDate: (date, options) => {
        if (!date) return ''
        const d = typeof date === 'object' ? date : new Date(date)
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pl-PL', options)
      },
      formatRelativeDate: (date) => {
        if (!date) return ''
        const d = typeof date === 'object' ? date : new Date(date)
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pl-PL')
      }
    }
  }
  return ctx
}

export function getLocalizedLabelName(
  label: { id?: string | null; name: string },
  t: (key: string, vars?: Record<string, string | number>, defaultText?: string) => string
): string {
  switch (label.id) {
    case 'lbl-priority':
      return t('label.system.priority', undefined, label.name)
    case 'lbl-clients':
      return t('label.system.clients', undefined, label.name)
    case 'lbl-finance':
      return t('label.system.finance', undefined, label.name)
    case 'lbl-urgent':
      return t('label.system.urgent', undefined, label.name)
    default:
      return label.name
  }
}
