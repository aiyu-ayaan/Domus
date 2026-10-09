import { useEffect, useState } from 'react'

type Theme = 'system' | 'dark' | 'light'
const THEME_KEY = 'docus.theme'

export function applyStoredTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY) as Theme | null
    if (t && t !== 'system') document.documentElement.dataset.theme = t
  } catch {
    /* ignore */
  }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])
  return [theme, setTheme]
}
