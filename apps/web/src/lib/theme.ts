import { useEffect, useSyncExternalStore } from 'react'
import { desktop } from './api'

export type Theme = 'system' | 'dark' | 'light'
const THEME_KEY = 'docus.theme'

let currentTheme: Theme = (() => {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) || 'system'
  } catch {
    return 'system'
  }
})()

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

function getSystemPreference(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function getResolvedTheme(theme: Theme = currentTheme): 'dark' | 'light' {
  if (theme === 'system') return getSystemPreference()
  return theme
}

function syncDocument(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'system') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
  desktop?.setTheme(theme)
}

export function applyStoredTheme() {
  try {
    const t = (localStorage.getItem(THEME_KEY) as Theme) || 'system'
    currentTheme = t
    syncDocument(t)
    notify()
  } catch {
    /* ignore */
  }
}

export function setTheme(theme: Theme) {
  currentTheme = theme
  syncDocument(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
  notify()
}

export function toggleTheme(): 'dark' | 'light' {
  const next = getResolvedTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export interface ThemeControls {
  resolved: 'dark' | 'light'
  toggle: () => 'dark' | 'light'
}

export function useTheme(): [Theme, (t: Theme) => void, ThemeControls] {
  const theme = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
      const onMediaChange = () => {
        if (currentTheme === 'system') {
          syncDocument('system')
          notify()
        }
      }
      media?.addEventListener?.('change', onMediaChange)
      const onStorage = (e: StorageEvent) => {
        if (e.key === THEME_KEY && e.newValue) {
          currentTheme = (e.newValue as Theme) || 'system'
          syncDocument(currentTheme)
          notify()
        }
      }
      window.addEventListener?.('storage', onStorage)
      return () => {
        listeners.delete(onStoreChange)
        media?.removeEventListener?.('change', onMediaChange)
        window.removeEventListener?.('storage', onStorage)
      }
    },
    () => currentTheme,
    () => 'system' as Theme,
  )

  const resolved = getResolvedTheme(theme)

  useEffect(() => {
    syncDocument(theme)
  }, [theme])

  return [theme, setTheme, { resolved, toggle: toggleTheme }]
}

