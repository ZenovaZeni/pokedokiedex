import { Link, Navigate } from 'react-router-dom'
import { BarChart3, Camera, ChevronRight, Library, Lock, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Landing() {
  const { user, multiUser, loading } = useAuth()

  if (!loading && (user || !multiUser)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg-primary text-text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(245,200,66,0.14),transparent_26%),radial-gradient(circle_at_82%_16%,rgba(79,195,247,0.10),transparent_28%),radial-gradient(circle_at_52%_100%,rgba(227,0,11,0.18),transparent_35%)]" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black tracking-[0.18em]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-red text-white shadow-glow-btn">P</span>
            <span>PokeDokieDex</span>
          </div>
          <Link to="/login" className="btn-ghost-sm">
            Sign in
            <ChevronRight size={16} />
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_420px] lg:py-16">
          <div className="space-y-7">
            <div className="max-w-3xl space-y-5">
              <h1 className="text-5xl font-black leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">
                Track every Pokemon card like a serious collector.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
                Build your collection, watch USD values, organize binders, and keep each trainer account separate on phone or desktop.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="btn-primary h-12 px-5 text-base">
                Start collecting
                <Sparkles size={18} />
              </Link>
              <a href="#security" className="btn-ghost h-12 px-5 text-base">
                See how accounts work
              </a>
            </div>

            <div className="grid max-w-2xl grid-cols-3 gap-3">
              {[
                ['Private', 'User data scoped by account'],
                ['USD', 'American pricing display'],
                ['Mobile', 'Fast phone-first views'],
              ].map(([value, label]) => (
                <div key={value} className="rounded-2xl border border-border bg-bg-card/70 p-4 backdrop-blur">
                  <p className="text-lg font-black text-gold">{value}</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rounded-[2rem] bg-brand-red/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-border bg-bg-card/90 p-4 shadow-2xl backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Portfolio value</p>
                  <p className="mt-1 text-4xl font-black text-gold">$9.63</p>
                </div>
                <ShieldCheck className="text-green" size={28} />
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary/70 p-3">
                <img
                  src="https://assets.tcgdex.net/en/base/base1/58/high.webp"
                  alt="Pikachu card preview"
                  className="mx-auto h-48 rounded-lg object-contain drop-shadow-2xl"
                />
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold">Pikachu</p>
                    <p className="text-xs text-text-muted">Base Set · Quantity 7</p>
                  </div>
                  <p className="font-black text-gold">$9.63</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="grid gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Lock, 'Separate accounts', 'Collections are queried by the logged-in Convex user session.'],
            [ShieldCheck, 'Safer sessions', 'Login is session-only unless someone chooses to stay signed in.'],
            [Library, 'Collection tools', 'Cards, binders, wishlist, analytics, and exports are ready to use.'],
            [Smartphone, 'Phone optimized', 'The core collection workflow is designed for mobile screens.'],
            [BarChart3, 'USD values', 'Money is shown for United States users by default.'],
            [Camera, 'Scanner ready', 'The next backend feature can connect phone camera card lookup.'],
          ].map(([Icon, title, body]) => (
            <div key={title} className="rounded-2xl border border-border bg-bg-card/70 p-4 backdrop-blur">
              <Icon className="mb-3 text-gold" size={22} />
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{body}</p>
            </div>
          ))}
        </section>

        <footer className="flex flex-col gap-2 border-t border-border py-5 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>Unofficial collector tool. Prices are estimates.</span>
          <Link to="/legal" className="font-semibold text-brand-red transition-opacity hover:opacity-80">
            About / Legal
          </Link>
        </footer>
      </div>
    </main>
  )
}
