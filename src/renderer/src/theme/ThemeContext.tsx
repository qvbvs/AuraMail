import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { FluentProvider, webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: ThemeMode
  resolvedTheme: ResolvedTheme
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const THEME_STORAGE_KEY = 'auramail_theme_preference'
const LEGACY_THEME_STORAGE_KEY = 'mailapp_theme_preference'

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = (localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_STORAGE_KEY)) as ThemeMode | null
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    } catch {
      // ignore
    }
    return 'system'
  })

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    if (resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme, resolvedTheme])

  const fluentTheme: Theme = useMemo(() => {
    return resolvedTheme === 'dark' ? webDarkTheme : webLightTheme
  }, [resolvedTheme])

  const setTheme = (mode: ThemeMode): void => {
    setThemeState(mode)
  }

  const toggleTheme = (): void => {
    setThemeState((prev) => {
      const currentResolved = prev === 'system' ? systemTheme : prev
      return currentResolved === 'dark' ? 'light' : 'dark'
    })
  }

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme
    }),
    [theme, resolvedTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <FluentProvider theme={fluentTheme} style={{ height: '100%', width: '100%' }}>
        {children}
      </FluentProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
