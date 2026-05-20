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
            <img src="/dokiedex-mark.svg" alt="" className="h-9 w-9 rounded-xl shadow-glow-btn" />
            <span>PokeDokieDex</span>
          </div>
          <Link to="/login" className="btn-ghost-sm">
            Sign in
            <ChevronRight size={16} />
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.88fr_1.12fr] lg:py-16">
          <div className="space-y-7">
            <div className="max-w-3xl space-y-5">
              <h1 className="text-5xl font-black leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">
                Card chaos, neatly contained.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
                Track your collection, check USD market estimates, organize binders, and let one very serious little scanner keep the nonsense in order.
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

          <div className="relative mx-auto w-full max-w-3xl">
            <div className="absolute -inset-5 rounded-[2rem] bg-brand-red/10 blur-3xl" />
            <picture>
              <source srcSet="/brand/dokiedex-hero.webp" type="image/webp" />
              <img
                src="/brand/dokiedex-hero.png"
                alt="A goofy original card-scanner mascot guarding a fictional card collection dashboard."
                className="relative aspect-[1717/916] w-full rounded-[1.5rem] border border-border object-cover object-center shadow-2xl"
                fetchPriority="high"
              />
            </picture>
          </div>
        </section>

        <section id="security" className="grid gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Lock, 'Separate accounts', 'Collections are queried by the logged-in Convex user session.'],
            [ShieldCheck, 'Safer sessions', 'Login is session-only unless someone chooses to stay signed in.'],
            [Library, 'Collection tools', 'Cards, binders, wishlist, analytics, and exports are ready to use.'],
            [Smartphone, 'Phone optimized', 'The core collection workflow is designed for mobile screens.'],
            [BarChart3, 'USD values', 'Money is shown for United States users by default.'],
            [Camera, 'Scanner ready', 'Phone camera card lookup can be wired in as the next big upgrade.'],
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
