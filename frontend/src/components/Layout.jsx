import { Outlet, useLocation } from 'react-router-dom'
import AppNav from './AppNav'
import BottomNav from './BottomNav'

export default function Layout() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="min-h-dvh flex flex-col bg-bg overflow-x-hidden">
      {!isHome && <AppNav />}
      <main className={`flex-1 ${!isHome ? 'w-full px-4 pb-nav lg:pb-8' : ''}`}>
        <Outlet />
      </main>
      {!isHome && <BottomNav />}
    </div>
  )
}
