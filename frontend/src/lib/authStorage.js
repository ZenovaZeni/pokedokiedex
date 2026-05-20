const TOKEN_KEY = 'token'
const USER_KEY = 'user'
const REMEMBER_KEY = 'rememberSession'

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser() {
  return sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY)
}

export function storeAuthSession(token, user, remember = false) {
  clearAuthSession()
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(TOKEN_KEY, token)
  storage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
}

export function updateStoredUser(user) {
  const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage
  storage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getRememberPreference() {
  return localStorage.getItem(REMEMBER_KEY) === '1'
}
