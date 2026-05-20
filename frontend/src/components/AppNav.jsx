import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'

const PAGE_TITLE_KEYS = {
  '/collection': 'nav.collection',
  '/search': 'nav.cardSearch',
  '/sets': 'nav.sets',
  '/analytics': 'nav.analytics',
  '/binders': 'nav.binders',
  '/wishlist': 'nav.wishlist',
  '/products': 'nav.products',
  '/leaderboard': 'nav.leaderboard',
  '/achievements': 'nav.achievements',
  '/settings': 'nav.settings',
  '/migration': 'migration.title',
  '/dashboard': 'nav.dashboard',
}

export default function AppNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, multiUser } = useAuth()
  const { t } = useSettings()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (location.pathname === '/') return null

  const titleKey = Object.entries(PAGE_TITLE_KEYS).find(
    ([path]) => location.pathname.startsWith(path)
  )?.[1]
  const title = titleKey ? t(titleKey) : ''

  return (
    <>
      {title && (
        <div
          className="sticky top-0 z-40 flex items-center justify-between px-4 pb-3 pt-5"
          style={{ background: 'linear-gradient(to bottom, rgba(6,8,15,0.98) 70%, transparent)' }}
        >
          <div className="w-8" />
          <p className="min-w-0 flex-1 truncate text-center text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
            {title}
          </p>
          {multiUser ? (
            <button
              onClick={handleLogout}
              className="pointer-events-auto flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-1.5 text-text-muted transition-colors hover:text-brand-red"
              aria-label={t('auth.logout')}
            >
              {user?.avatar_id ? (
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${user.avatar_id}.gif`}
                  alt={`${user.username} avatar`}
                  className="h-5 w-5 pixelated"
                />
              ) : null}
              <LogOut size={16} />
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
      )}
    </>
  )
}
