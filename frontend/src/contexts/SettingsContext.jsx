import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import en from '../i18n/en'
import { getStoredToken } from '../lib/authStorage'

const translations = { en }

const DEFAULT_SETTINGS = {
  language: 'en',
  currency: 'USD',
  price_display: '["trend", "avg1", "avg7", "avg30", "low"]',
  price_primary: 'trend',
  tcgdex_sync_languages: 'en',
  cross_language_price_fallback: 'false',
  cross_language_image_fallback: 'false',
  debug_mode: 'false',
}

function normalizeSettings(data = {}) {
  return {
    ...data,
    language: 'en',
    currency: 'USD',
    tcgdex_sync_languages: 'en',
    cross_language_price_fallback: 'false',
    cross_language_image_fallback: 'false',
  }
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [exchangeRate, setExchangeRate] = useState(1.0)

  // Load settings from backend on mount
  useEffect(() => {
    const token = getStoredToken()
    if (!token) { setLoaded(true); return }
    fetch('/api/settings/', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...normalizeSettings(data) }))
        setLoaded(true)
      })
      .catch(() => {
        // Backend not available, use defaults
        setLoaded(true)
      })
  }, [])

  // Fetch exchange rate whenever currency changes to USD
  useEffect(() => {
    const curr = settings.currency || 'USD'
    if (curr === 'USD') {
      fetch('https://api.frankfurter.app/latest?from=EUR&to=USD')
        .then(r => r.json())
        .then(data => setExchangeRate(data.rates?.USD || 1.1))
        .catch(() => setExchangeRate(1.1))
    } else {
      setExchangeRate(1.0)
    }
  }, [settings.currency])

  // Update one or more settings
  const updateSettings = useCallback(async (updates) => {
    const safeUpdates = normalizeSettings(updates)
    const next = { ...settings, ...safeUpdates }
    setSettings(next)
    try {
      const token = getStoredToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const resp = await fetch('/api/settings/', {
        method: 'PUT',
        headers,
        body: JSON.stringify(safeUpdates),
      })
      if (!resp.ok) throw new Error('Save failed')
      const saved = await resp.json()
      setSettings(prev => ({ ...prev, ...normalizeSettings(saved) }))
    } catch (err) {
      setSettings(settings)
      console.error('Failed to save settings:', err)
      throw err
    }
  }, [settings])

  const lang = 'en'
  const msgs = translations.en

  // Translation helper
  const t = useCallback((path) => {
    const parts = path.split('.')
    let val = msgs
    for (const part of parts) {
      val = val?.[part]
      if (val === undefined) break
    }
    if (val === undefined) {
      // Fallback to English
      let fallback = translations.en
      for (const part of parts) {
        fallback = fallback?.[part]
        if (fallback === undefined) break
      }
      return fallback ?? path
    }
    return val
  }, [msgs])

  // Parse price_display JSON safely
  const getPriceDisplay = useCallback(() => {
    try {
      const val = settings.price_display
      if (Array.isArray(val)) return val
      return JSON.parse(val || '["trend", "avg1", "avg7", "avg30", "low"]')
    } catch {
      return ['trend', 'avg1', 'avg7', 'avg30', 'low']
    }
  }, [settings.price_display])

  const getPricePrimary = useCallback(() => {
    return settings.price_primary || 'trend'
  }, [settings.price_primary])

  const currency = 'USD'
  const currencySymbol = '$'

  const formatPrice = useCallback((eurAmount) => {
    if (eurAmount == null || isNaN(Number(eurAmount))) return '-'
    const converted = Number(eurAmount) * exchangeRate
    return `${currencySymbol}${converted.toFixed(2)}`
  }, [exchangeRate, currencySymbol])

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      t,
      language: lang,
      priceDisplay: getPriceDisplay(),
      pricePrimary: getPricePrimary(),
      loaded,
      currency,
      currencySymbol,
      formatPrice,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

export default SettingsContext
