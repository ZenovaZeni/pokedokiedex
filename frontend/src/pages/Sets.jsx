import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, ChevronDown, ChevronUp, Filter, Layers3, Search, SortAsc, Target, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSets, markSetsSeen } from '../api/client'
import { useSettings } from '../contexts/SettingsContext'
import { resolveSetImageUrl } from '../utils/imageUrl'

function SetImage({ set, className, fallbackClassName = '', alt = '' }) {
  const [mode, setMode] = useState('logo')
  const logo = resolveSetImageUrl(set, 'logo')
  const symbol = resolveSetImageUrl(set, 'symbol')
  const src = mode === 'logo' ? logo : mode === 'symbol' ? symbol : null

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onError={() => setMode((current) => (current === 'logo' && symbol ? 'symbol' : 'text'))}
      />
    )
  }

  return (
    <div className={`relative z-10 flex min-h-14 items-center justify-center rounded-2xl border border-white/10 bg-bg-card px-3 py-2 text-center text-xs font-bold text-text-secondary ${fallbackClassName}`}>
      {set.name}
    </div>
  )
}

export default function Sets() {
  const navigate = useNavigate()
  const { t } = useSettings()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [series, setSeries] = useState('')
  const [sortBy, setSortBy] = useState('release_date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [progressFilter, setProgressFilter] = useState('all')

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['sets', 'en'],
    queryFn: () => getSets({ lang: 'en' }).then((r) => r.data),
  })

  const markSeenMutation = useMutation({
    mutationFn: markSetsSeen,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sets'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(t('sets.markedSeen'))
    },
  })

  const newSets = sets.filter((set) => set.is_new)
  const allSeries = [...new Set(sets.map((set) => set.series).filter(Boolean))].sort()
  const setProgressSummary = useMemo(() => {
    const withTotals = sets.filter((set) => (set.total ?? 0) > 0)
    const started = withTotals.filter((set) => (set.owned_count ?? 0) > 0)
    const completed = withTotals.filter((set) => (set.owned_count ?? 0) >= (set.total ?? 0))
    const missing = started.reduce((sum, set) => sum + Math.max(0, (set.total ?? 0) - (set.owned_count ?? 0)), 0)
    const closest = started
      .filter((set) => (set.owned_count ?? 0) < (set.total ?? 0))
      .sort((a, b) => {
        const pctA = (a.owned_count ?? 0) / (a.total ?? 1)
        const pctB = (b.owned_count ?? 0) / (b.total ?? 1)
        if (pctA !== pctB) return pctB - pctA
        return ((a.total ?? 0) - (a.owned_count ?? 0)) - ((b.total ?? 0) - (b.owned_count ?? 0))
      })[0]

    return {
      startedCount: started.length,
      completedCount: completed.length,
      missingCount: missing,
      closest,
    }
  }, [sets])

  const filtered = useMemo(() => {
    const next = sets.filter((set) => {
      if (search && !set.name.toLowerCase().includes(search.toLowerCase())) return false
      if (series && set.series !== series) return false
      const owned = set.owned_count ?? 0
      const total = set.total ?? 0
      if (progressFilter === 'started' && owned === 0) return false
      if (progressFilter === 'complete' && (owned < total || total === 0)) return false
      return true
    })

    return [...next].sort((a, b) => {
      const ownedA = a.owned_count ?? 0
      const ownedB = b.owned_count ?? 0
      let valA
      let valB

      switch (sortBy) {
        case 'release_date':
          valA = a.release_date || ''
          valB = b.release_date || ''
          break
        case 'name':
          valA = a.name.toLowerCase()
          valB = b.name.toLowerCase()
          break
        case 'total':
          valA = a.total ?? 0
          valB = b.total ?? 0
          break
        case 'progress':
          valA = a.total > 0 ? ownedA / a.total : 0
          valB = b.total > 0 ? ownedB / b.total : 0
          break
        default:
          return 0
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [sets, search, series, progressFilter, sortBy, sortOrder])

  const toggleOrder = () => setSortOrder((value) => (value === 'asc' ? 'desc' : 'asc'))

  const hero = filtered.length
    ? filtered.reduce((best, set) => {
        const bestPct = best.total > 0 ? (best.owned_count || 0) / best.total : 0
        const setPct = set.total > 0 ? (set.owned_count || 0) / set.total : 0
        return setPct > bestPct ? set : best
      }, filtered[0])
    : null

  const renderProgress = (owned, total) => {
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0
    const hpClass = pct >= 66 ? 'healthy' : pct >= 33 ? 'medium' : 'low'

    return (
      <>
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="text-text-muted">{owned}/{total}</span>
          <span className={`font-bold ${pct === 100 ? 'text-green' : 'text-text-secondary'}`}>{pct}%</span>
        </div>
        <div className="hp-bar-track">
          <div className={`hp-bar-fill ${owned > 0 ? hpClass : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </>
    )
  }

  return (
    <div className="space-y-4 pb-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text-primary">{t('sets.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {sets.length} {t('sets.setsTotal')}
            {newSets.length > 0 && <span className="badge badge-red ml-2">{newSets.length} {t('sets.newSets')}</span>}
          </p>
        </div>
        {newSets.length > 0 && (
          <button onClick={() => markSeenMutation.mutate()} className="btn-ghost py-1.5 text-sm">
            <BellOff size={14} /> {t('sets.markAllSeen')}
          </button>
        )}
      </div>

      {newSets.length > 0 && (
        <div className="card border-brand-red/30 bg-brand-red/5">
          <div className="flex items-center gap-3">
            <Bell size={18} className="flex-shrink-0 text-brand-red" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {newSets.length} {t('sets.newSets')} {t('sets.newSetsDetected')}
              </p>
              <p className="text-xs text-text-secondary">{newSets.map((set) => set.name).join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      {!isLoading && sets.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            {
              icon: Layers3,
              label: 'In progress',
              value: setProgressSummary.startedCount.toLocaleString(),
              tone: 'text-blue-400',
            },
            {
              icon: Trophy,
              label: 'Completed',
              value: setProgressSummary.completedCount.toLocaleString(),
              tone: 'text-gold',
            },
            {
              icon: Target,
              label: 'Missing cards',
              value: setProgressSummary.missingCount.toLocaleString(),
              tone: 'text-brand-red',
            },
            {
              icon: Target,
              label: 'Closest set',
              value: setProgressSummary.closest
                ? `${Math.max(0, (setProgressSummary.closest.total ?? 0) - (setProgressSummary.closest.owned_count ?? 0))} left`
                : 'Start one',
              detail: setProgressSummary.closest?.name || 'Add cards to begin',
              tone: 'text-green',
              onClick: setProgressSummary.closest ? () => navigate(`/sets/${setProgressSummary.closest.id}`) : undefined,
            },
          ].map(({ icon: Icon, label, value, detail, tone, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              disabled={!onClick}
              className="rounded-2xl border border-border bg-bg-card p-3 text-left transition-colors enabled:hover:border-brand-red/40 disabled:cursor-default"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
                <Icon size={15} className={tone} />
              </div>
              <p className={`text-xl font-black leading-tight ${tone}`}>{value}</p>
              {detail && <p className="mt-1 truncate text-[11px] text-text-muted">{detail}</p>}
            </button>
          ))}
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1" style={{ flexBasis: '160px' }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder={t('sets.filterSets')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input py-2 pl-8 text-sm"
            />
          </div>
          <select className="select w-full py-2 text-sm sm:w-48" value={series} onChange={(event) => setSeries(event.target.value)}>
            <option value="">{t('common.allSeries')}</option>
            {allSeries.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <SortAsc size={14} className="flex-shrink-0 text-text-muted" />
            <select className="select flex-1 py-1.5 text-sm sm:w-40 sm:flex-initial" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="release_date">{t('sets.sortReleaseDate')}</option>
              <option value="name">{t('sets.sortName')}</option>
              <option value="total">{t('sets.sortCardCount')}</option>
              <option value="progress">{t('sets.sortProgress')}</option>
            </select>
            <button onClick={toggleOrder} className="btn-ghost flex-shrink-0 px-2 py-1.5 text-sm font-medium">
              {sortOrder === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <Filter size={14} className="mr-1 flex-shrink-0 text-text-muted" />
            {[
              { value: 'all', label: t('sets.filterAll') },
              { value: 'started', label: t('sets.filterStarted') },
              { value: 'complete', label: t('sets.filterComplete') },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setProgressFilter(option.value)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  progressFilter === option.value
                    ? 'bg-brand-red text-white'
                    : 'border border-border bg-bg-card text-text-secondary hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-text-muted sm:ml-auto">
            {filtered.length} / {sets.length} {t('sets.setsTotal')}
          </span>
        </div>
      </div>

      {!isLoading && hero && (() => {
        const owned = hero.owned_count ?? 0
        const total = hero.total ?? 0
        const pct = total > 0 ? Math.round((owned / total) * 100) : 0

        return (
          <div className="set-hero group mb-6 cursor-pointer" onClick={() => navigate(`/sets/${hero.id}`)}>
            <div className="set-hero-glow" />
            <div className="relative z-10 flex items-center justify-between gap-4 p-6">
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-red">{t('sets.topSet')}</p>
                <p className="mb-1 break-words text-2xl font-black leading-tight text-white">{hero.name}</p>
                <p className="mb-4 text-sm text-text-muted">{hero.series}</p>
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-sm text-text-secondary">{owned}/{total} {t('sets.heroCards')}</span>
                  <span className={`text-sm font-bold ${pct === 100 ? 'text-green' : 'text-text-primary'}`}>{pct}%</span>
                </div>
                <div className="hp-bar-track w-48 max-w-full">
                  <div className={`hp-bar-fill ${pct >= 66 ? 'healthy' : pct >= 33 ? 'medium' : 'low'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex h-28 w-36 flex-shrink-0 items-center justify-center">
                <SetImage
                  set={hero}
                  alt={hero.name}
                  className="set-hero-logo transition-transform duration-300 group-hover:scale-105"
                  fallbackClassName="max-w-[9rem]"
                />
              </div>
            </div>
          </div>
        )
      })()}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-border">
              <div className="skeleton h-32" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-4 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton mt-3 h-2 w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((set) => {
            const owned = set.owned_count ?? 0
            const total = set.total ?? 0
            const releaseDate = set.release_date ? new Date(set.release_date) : null
            const releaseLabel = releaseDate && !Number.isNaN(releaseDate.getTime())
              ? releaseDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : set.release_date

            return (
              <div
                key={set.id}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-bg-card transition-all duration-200 hover:border-brand-red/40 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
                onClick={() => navigate(`/sets/${set.id}`)}
              >
                {set.is_new && <span className="badge badge-red absolute left-2 top-2 z-10">{t('common.new')}</span>}

                <div className="relative flex h-28 items-center justify-center overflow-hidden bg-bg-elevated sm:h-32">
                  <div
                    className="absolute inset-0 opacity-5"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 0)',
                      backgroundSize: '24px 24px',
                    }}
                  />
                  <SetImage
                    set={set}
                    alt={set.name}
                    className="relative z-10 max-h-[80%] max-w-[75%] object-contain transition-transform duration-300 group-hover:scale-105"
                    fallbackClassName="mx-4"
                  />
                  {total > 0 && owned >= total && (
                    <span className="absolute right-2 top-2 z-10 rounded-full border border-green/30 bg-green/20 px-2 py-0.5 text-[10px] font-black text-green">
                      COMPLETE
                    </span>
                  )}
                </div>

                <div className="p-3">
                  <p className="mb-0.5 truncate text-sm font-bold leading-tight text-text-primary">{set.name}</p>
                  <p className="mb-0.5 text-[11px] text-text-muted">
                    {set.abbreviation && <span className="mr-1 font-mono font-bold text-text-secondary">{set.abbreviation}</span>}
                    {set.series}
                    {set.total ? ` · ${set.total} ${t('sets.cards')}` : ''}
                  </p>
                  {releaseLabel ? <p className="mb-2 text-[10px] text-text-muted">{releaseLabel}</p> : <div className="mb-2.5" />}
                  {renderProgress(owned, total)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="py-12 text-center text-text-muted">{t('sets.noSetsFound')}</div>
      )}
    </div>
  )
}
