import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck, Sparkles, User, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { login } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { getRememberPreference } from '../lib/authStorage'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [lastUser] = useState(() => localStorage.getItem('lastUser') || '')
  const [lastUserAvatar] = useState(() => localStorage.getItem('lastUserAvatar') || '')
  const [username, setUsername] = useState(() => localStorage.getItem('lastUser') || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(getRememberPreference)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { user, loginUser, multiUser } = useAuth()
  const navigate = useNavigate()

  if (user || !multiUser) {
    return <Navigate to="/dashboard" replace />
  }

  const isCreate = mode === 'create'
  const canSubmit = username.trim().length >= 3 && password.length >= 8 && !loading

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setLoading(true)

    try {
      const data = await login(username.trim(), password)
      localStorage.setItem('lastUser', username.trim())
      localStorage.setItem('lastUserAvatar', data.user.avatar_id || '')
      loginUser(data.access_token, data.user, remember)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg-primary px-4 py-5 sm:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(245,200,66,0.14),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(79,195,247,0.10),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(227,0,11,0.16),transparent_34%)]" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between py-2">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary">
            <ArrowLeft size={18} />
            Home
          </Link>
          <div className="flex items-center gap-2 text-sm font-black tracking-[0.18em] text-text-primary">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-red text-white shadow-glow-btn">P</span>
            <span className="hidden sm:inline">PokeDokieDex</span>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_430px] lg:gap-12">
          <div className="space-y-8">
            <div className="max-w-2xl space-y-4">
              <h1 className="text-4xl font-black leading-tight text-text-primary sm:text-5xl lg:text-6xl">
                Your card collection, protected by your own trainer account.
              </h1>
              <p className="max-w-xl text-base leading-7 text-text-secondary sm:text-lg">
                Sign in to manage your Pokemon cards, values, binders, wishlist, and collection stats from any phone or browser.
              </p>
            </div>

            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ['Private collection', 'Your cards are tied to your account.'],
                ['Session-first login', 'Stay signed in only when you choose.'],
                ['Mobile ready', 'Built for quick checks on your phone.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-border bg-bg-card/70 p-4 backdrop-blur">
                  <ShieldCheck className="mb-3 text-green" size={22} />
                  <p className="text-sm font-bold text-text-primary">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-border bg-bg-card/85 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
            <div className="mb-6 flex rounded-xl border border-border bg-bg-primary/70 p-1">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${!isCreate ? 'bg-brand-red text-white shadow-glow-btn' : 'text-text-muted hover:text-text-primary'}`}
              >
                <Lock size={16} />
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${isCreate ? 'bg-brand-red text-white shadow-glow-btn' : 'text-text-muted hover:text-text-primary'}`}
              >
                <UserPlus size={16} />
                Create
              </button>
            </div>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-bg-primary shadow-elevated">
                {lastUserAvatar && !isCreate ? (
                  <img
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${lastUserAvatar}.gif`}
                    alt={`${lastUser} avatar`}
                    className="h-12 w-12 pixelated"
                  />
                ) : (
                  <User className="text-gold" size={34} />
                )}
              </div>
              <h2 className="text-2xl font-black text-text-primary">
                {isCreate ? 'Create your trainer account' : lastUser ? `Welcome back, ${lastUser}` : 'Sign in to your collection'}
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                {isCreate ? 'New accounts are created instantly.' : 'Use your username and password to continue.'}
              </p>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">Username</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="input h-12"
                  placeholder="trainer_name"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="input h-12 pr-12"
                    placeholder="At least 8 characters"
                    autoComplete={isCreate ? 'new-password' : 'current-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-muted transition-colors hover:text-text-primary"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-bg-primary/60 p-3">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-brand-red"
                />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">Keep me signed in</span>
                  <span className="block text-xs leading-5 text-text-muted">Off by default for safer shared-device use.</span>
                </span>
              </label>

              <button type="submit" disabled={!canSubmit} className="btn-primary h-12 w-full text-base">
                <Sparkles size={18} />
                {loading ? 'Signing in...' : isCreate ? 'Create account' : 'Sign in'}
              </button>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-text-muted">
              Passwords are hashed before storage. Use a unique password for this app.
            </p>
          </form>
        </section>
      </div>
    </main>
  )
}
