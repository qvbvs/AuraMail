import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const accentOptions = ['graphite', 'blue', 'teal', 'violet'] as const
export const densityOptions = ['compact', 'comfortable', 'spacious'] as const
export const readingSizeOptions = ['standard', 'large', 'extraLarge'] as const

interface AppearancePreferences {
  accent: (typeof accentOptions)[number]
  density: (typeof densityOptions)[number]
  readingSize: (typeof readingSizeOptions)[number]
}

interface ThemeContextType {
  theme: ThemeMode
  resolvedTheme: ResolvedTheme
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
  appearance: AppearancePreferences
  updateAppearance: (changes: Partial<AppearancePreferences>) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const THEME_STORAGE_KEY = 'auramail_theme_preference'
const LEGACY_THEME_STORAGE_KEY = 'mailapp_theme_preference'
const APPEARANCE_STORAGE_KEY = 'auramail_appearance_preferences'

const defaultAppearance: AppearancePreferences = {
  accent: 'graphite',
  density: 'comfortable',
  readingSize: 'standard'
}

function readAppearance(): AppearancePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null') as Partial<AppearancePreferences> | null
    return {
      accent: accentOptions.find((value) => value === saved?.accent) ?? defaultAppearance.accent,
      density: densityOptions.find((value) => value === saved?.density) ?? defaultAppearance.density,
      readingSize: readingSizeOptions.find((value) => value === saved?.readingSize) ?? defaultAppearance.readingSize
    }
  } catch {
    return defaultAppearance
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = (localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_STORAGE_KEY)) as ThemeMode | null
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    } catch {
      // ignore
    }
    return 'system'
  })

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)
  const [appearance, setAppearance] = useState(readAppearance)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.dataset.accent = appearance.accent
    root.dataset.messageDensity = appearance.density
  }, [resolvedTheme, appearance.accent, appearance.density])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
    } catch {
      // ignore
    }
  }, [theme, appearance])

  const updateAppearance = useCallback((changes: Partial<AppearancePreferences>): void => {
    setAppearance((current) => ({ ...current, ...changes }))
  }, [])

  const toggleTheme = useCallback((): void => {
    setTheme((prev) => {
      const currentResolved = prev === 'system' ? systemTheme : prev
      return currentResolved === 'dark' ? 'light' : 'dark'
    })
  }, [systemTheme])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      appearance,
      updateAppearance
    }),
    [theme, resolvedTheme, toggleTheme, appearance, updateAppearance]
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
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
