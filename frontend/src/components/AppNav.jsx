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
  '/ebay': 'nav.ebayMarket',
  '/legal': 'nav.legal',
}

function ElectricMouseMascot() {
  return (
    <span
      className="relative flex h-7 w-7 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <span className="absolute left-1 top-0 h-3 w-2 -rotate-[28deg] rounded-[70%_70%_30%_30%] bg-yellow" />
      <span className="absolute right-1 top-0 h-3 w-2 rotate-[28deg] rounded-[70%_70%_30%_30%] bg-yellow" />
      <span
        className="relative h-5 w-6 rounded-full border border-yellow/60 bg-yellow shadow-[0_0_16px_rgba(245,200,66,0.38)]"
        style={{ animation: 'mascot-bob 1.8s ease-in-out infinite' }}
      >
        <span className="absolute left-1.5 top-1.5 h-1 w-1 rounded-full bg-black" />
        <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-black" />
        <span className="absolute left-0.5 top-2.5 h-1.5 w-1.5 rounded-full bg-brand-red/70" />
        <span className="absolute right-0.5 top-2.5 h-1.5 w-1.5 rounded-full bg-brand-red/70" />
        <span className="absolute left-1/2 top-2.5 h-1 w-1 -translate-x-1/2 rounded-full bg-black" />
      </span>
      <span
        className="absolute -right-1 top-3 h-2.5 w-3 border-r-2 border-t-2 border-yellow"
        style={{ transform: 'rotate(35deg)', animation: 'mascot-tail 1.8s ease-in-out infinite' }}
      />
    </span>
  )
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
              <ElectricMouseMascot />
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
