import { createContext, useContext, useEffect, useState } from 'react'
import { getAuthMode, getMe, logoutSession } from '../api/client'
import { clearAuthSession, getStoredToken, getStoredUser, storeAuthSession, updateStoredUser } from '../lib/authStorage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = getStoredUser()
    if (!stored) return null
    try {
      return JSON.parse(stored)
    } catch {
      clearAuthSession()
      return null
    }
  })
  const [loading, setLoading] = useState(true)
  const [multiUser, setMultiUser] = useState(true)

  useEffect(() => {
    getAuthMode()
      .then(({ multi_user }) => {
        setMultiUser(multi_user)
        const token = getStoredToken()
        if (!multi_user || token) {
          return getMe().then((currentUser) => {
            setUser(currentUser)
            updateStoredUser(currentUser)
          })
        }
        setUser(null)
      })
      .catch(() => {
        const token = getStoredToken()
        if (token) {
          return getMe().then((currentUser) => {
            setUser(currentUser)
            updateStoredUser(currentUser)
          })
        }
      })
      .catch(() => {
        clearAuthSession()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const loginUser = (token, userData, remember = false) => {
    storeAuthSession(token, userData, remember)
    setUser(userData)
  }

  const updateCurrentUser = (updates) => {
    setUser((prev) => {
      const next = prev ? { ...prev, ...updates } : prev
      if (next) {
        updateStoredUser(next)
      }
      return next
    })
  }

  const logout = () => {
    logoutSession().catch(() => {})
    clearAuthSession()
    setUser(null)
    // Force full page reload to clear all cached data (React Query, etc.)
    // Prevents settings/data from previous user session leaking
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, loading, multiUser, loginUser, updateCurrentUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
