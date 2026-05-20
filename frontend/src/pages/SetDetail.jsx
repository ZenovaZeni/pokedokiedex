import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Check } from 'lucide-react'
import { getSetChecklist, addToCollection } from '../api/client'
import { useSettings } from '../contexts/SettingsContext'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { resolveCardImageUrl, resolveSetImageUrl } from '../utils/imageUrl'
import { getDefaultVariantOrNull } from '../utils/cardVariants'
import FallbackBadges from '../components/FallbackBadges'

export default function SetDetail() {
  const { setId } = useParams()
  const navigate = useNavigate()
  const { t } = useSettings()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['set-checklist', setId],
    queryFn: () => getSetChecklist(setId).then(r => r.data),
  })

  const setLang = data?.set?.lang || 'en'

  const addMutation = useMutation({
    mutationFn: (card) => addToCollection({
      card_id: card.id,
      quantity: 1,
      condition: 'NM',
      variant: getDefaultVariantOrNull(card),
      lang: setLang,
    }),
    onSuccess: () => {
      toast.success(t('card.addedToCollection'))
      queryClient.invalidateQueries({ queryKey: ['set-checklist', setId] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
    },
    onError: () => toast.error(t('card.addFailed')),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-32 rounded" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {[...Array(20)].map((_, i) => <div key={i} className="skeleton aspect-[2.5/3.5] rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <p className="text-brand-red">{t('setDetail.loadFailed')} {error.message}</p>
        <button onClick={() => navigate(-1)} className="btn-ghost mx-auto mt-4">
          <ArrowLeft size={16} /> {t('setDetail.goBack')}
        </button>
      </div>
    )
  }

  const { set = null, cards = [] } = data || {}
  const ownedCount = Number(data?.owned_count ?? cards.filter(card => card.owned).length)
  const totalCount = Number(data?.total_count ?? cards.length)
  const progress = Number.isFinite(Number(data?.progress))
    ? Number(data.progress)
    : totalCount > 0
      ? Math.round((ownedCount / totalCount) * 1000) / 10
      : 0
  const missingCount = Math.max(0, totalCount - ownedCount)

  const filteredCards = cards.filter(card => {
    if (filter === 'owned') return card.owned
    if (filter === 'missing') return !card.owned
    return true
  })

  return (
    <div className="space-y-4 pb-2">
      <button onClick={() => navigate('/sets')} className="btn-ghost py-1.5 text-sm">
        <ArrowLeft size={14} /> {t('nav.sets')}
      </button>

      <div className="card">
        <div className="flex items-start gap-4">
          {resolveSetImageUrl(set, 'logo') && (
            <img
              src={resolveSetImageUrl(set, 'logo')}
              alt={set?.name || ''}
              className="h-12 max-w-[120px] flex-shrink-0 object-contain sm:h-16"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-text-primary">{set?.name || t('nav.sets')}</h1>
            <p className="text-sm text-text-secondary">
              {[set?.series, `${totalCount} ${t('setDetail.cards')}`].filter(Boolean).join(' · ')}
            </p>

            <div className="mt-3">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-text-secondary">
                  {ownedCount} / {totalCount} {t('setDetail.ownedOf')}
                </span>
                <span className="font-bold text-brand-red">{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
            </div>

            <div className="mt-3 flex gap-4 md:hidden">
              <div>
                <p className="text-lg font-bold text-green">{ownedCount}</p>
                <p className="text-xs text-text-muted">{t('setDetail.owned')}</p>
              </div>
              <div>
                <p className="text-lg font-bold text-brand-red">{missingCount}</p>
                <p className="text-xs text-text-muted">{t('setDetail.missing')}</p>
              </div>
            </div>
          </div>

          <div className="hidden flex-shrink-0 text-right md:block">
            <div className="flex gap-4">
              <div>
                <p className="text-2xl font-bold text-green">{ownedCount}</p>
                <p className="text-xs text-text-muted">{t('setDetail.owned')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-red">{missingCount}</p>
                <p className="text-xs text-text-muted">{t('setDetail.missing')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'all', label: `${t('setDetail.all')} (${cards.length})` },
          { key: 'owned', label: `${t('setDetail.owned')} (${ownedCount})` },
          { key: 'missing', label: `${t('setDetail.missing')} (${missingCount})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm font-medium transition-all',
              filter === key
                ? 'border border-brand-red/30 bg-brand-red/20 text-brand-red'
                : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {filteredCards.map((card) => (
          <div
            key={card.id}
            onClick={() => { if (!card.owned) addMutation.mutate(card) }}
            onKeyDown={(e) => { if (!card.owned && (e.key === 'Enter' || e.key === ' ')) addMutation.mutate(card) }}
            role={card.owned ? undefined : 'button'}
            tabIndex={card.owned ? undefined : 0}
            className={clsx(
              'group relative overflow-hidden rounded-lg transition-all duration-200',
              card.owned
                ? 'cursor-default ring-2 ring-green/50 hover:ring-green'
                : 'cursor-pointer opacity-60 ring-1 ring-brand-red/30 hover:opacity-90 hover:ring-brand-red/60'
            )}
          >
            {resolveCardImageUrl(card) ? (
              <img src={resolveCardImageUrl(card)} alt={card.name} className="aspect-[2.5/3.5] w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex aspect-[2.5/3.5] w-full items-center justify-center bg-bg-card p-1 text-center text-xs text-text-muted">
                {card.name}
              </div>
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              <p className="line-clamp-2 px-1 text-center text-xs font-medium text-white">{card.name}</p>
              <FallbackBadges card={card} className="justify-center" compact />
              {!card.owned && (
                <button onClick={(e) => { e.stopPropagation(); addMutation.mutate(card) }} className="rounded-full bg-brand-red p-1 text-white">
                  <Plus size={12} />
                </button>
              )}
            </div>

            {card.owned && (
              <div className="absolute right-0.5 top-0.5 rounded-full bg-green p-0.5">
                <Check size={8} className="text-white" />
              </div>
            )}
            {card.quantity > 1 && (
              <div className="absolute left-0.5 top-0.5 rounded bg-bg-surface/90 px-1 text-xs font-bold text-text-primary">
                {card.quantity}x
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-xs text-text-secondary">
              #{card.number}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
