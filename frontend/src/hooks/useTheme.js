import { useState, useEffect, useCallback } from 'react'

const THEMES = [
  { id: 'default', label: 'Dokie Red', color: '#e3000b', emoji: 'RD' },
  { id: 'fire', label: 'Fire', color: '#ff6b35', emoji: 'FR' },
  { id: 'water', label: 'Water', color: '#4fc3f7', emoji: 'WT' },
  { id: 'grass', label: 'Grass', color: '#66bb6a', emoji: 'GR' },
  { id: 'electric', label: 'Electric', color: '#fdd835', emoji: 'EL' },
  { id: 'psychic', label: 'Psychic', color: '#ce93d8', emoji: 'PS' },
  { id: 'dragon', label: 'Dragon', color: '#9575cd', emoji: 'DG' },
  { id: 'dark', label: 'Dark', color: '#78909c', emoji: 'DK' },
  { id: 'fairy', label: 'Fairy', color: '#f48fb1', emoji: 'FY' },
]

export function useTheme() {
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'default')

  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const setTheme = useCallback((nextTheme) => setThemeState(nextTheme), [])

  return { theme, setTheme, themes: THEMES }
}
