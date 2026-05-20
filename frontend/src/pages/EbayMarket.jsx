import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Search, ShieldCheck, Store, TrendingUp } from 'lucide-react'
import { getEbayStatus, searchEbayListings } from '../api/client'

function formatRange(summary) {
  if (!summary?.count || summary.min == null || summary.median == null || summary.max == null) {
    return 'No price range yet'
  }
  const format = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  return `${format(summary.min)} - ${format(summary.max)}`
}

function setupMessage(error, status) {
  if (error?.response?.data?.code === 'EBAY_NOT_CONFIGURED' || status?.configured === false) {
    return 'Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel environment variables to turn on live eBay results.'
  }
  return error?.response?.data?.detail || 'eBay search is unavailable right now.'
}

export default function EbayMarket() {
  const [input, setInput] = useState('Charizard card')
  const [query, setQuery] = useState('')
  const [searchId, setSearchId] = useState(0)

  const { data: status } = useQuery({
    queryKey: ['ebay-status'],
    queryFn: getEbayStatus,
    staleTime: 60_000,
  })

  const {
    data,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['ebay-search', query, searchId],
    queryFn: () => searchEbayListings({ q: query, limit: 10 }),
    enabled: Boolean(query),
    retry: false,
  })

  const results = data?.items || []
  const hasSearched = Boolean(query)
  const summaryLabel = useMemo(() => formatRange(data?.summary), [data])

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextQuery = input.trim()
    if (nextQuery.length < 2) return
    setQuery(nextQuery)
    setSearchId((value) => value + 1)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-2">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">eBay Market</h1>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Compare active eBay listings without mixing asking prices into your official collection value.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-bg-card px-3 py-1.5 text-xs font-semibold text-text-secondary">
          <Store size={14} className="text-brand-red" />
          {status?.configured ? status.marketplace_id || 'EBAY_US' : 'Setup needed'}
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-bg-card/80 p-4 backdrop-blur">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="input h-12 pl-9"
              placeholder="Search eBay, e.g. Pikachu 58/102 Base Set NM"
            />
          </div>
          <button type="submit" disabled={isFetching || input.trim().length < 2} className="btn-primary h-12 px-5">
            {isFetching ? 'Checking...' : 'Check eBay'}
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-text-muted">
          These are live active-listing asking prices from eBay Browse API. They are useful comps, not sold prices or appraisals.
        </p>
      </section>

      {(error || status?.configured === false) && (
        <section className="rounded-2xl border border-yellow/30 bg-yellow/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="mt-0.5 flex-shrink-0 text-yellow" />
            <div>
              <h2 className="text-sm font-bold text-yellow">eBay API setup</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{setupMessage(error, status)}</p>
              <p className="mt-2 text-xs leading-5 text-text-muted">
                The client secret stays on the Vercel serverless API and is never sent to the browser.
              </p>
            </div>
          </div>
        </section>
      )}

      {data && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-bg-card/80 p-4">
            <p className="text-xs text-text-muted">Results</p>
            <p className="mt-1 text-2xl font-black text-text-primary">{data.summary?.count || 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-bg-card/80 p-4 sm:col-span-2">
            <p className="text-xs text-text-muted">Active listing range</p>
            <p className="mt-1 text-2xl font-black text-green">{summaryLabel}</p>
          </div>
        </section>
      )}

      {!hasSearched && !data && (
        <section className="rounded-2xl border border-border bg-bg-card/60 p-8 text-center">
          <TrendingUp className="mx-auto text-brand-red" size={30} />
          <p className="mt-3 text-sm text-text-secondary">
            Search a card name, set, number, condition, or variant to see current eBay asking prices.
          </p>
        </section>
      )}

      {results.length > 0 && (
        <section className="grid gap-3">
          {results.map((item) => (
            <article key={item.id || item.url} className="rounded-2xl border border-border bg-bg-card/80 p-3">
              <div className="flex gap-3">
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-bg-primary">
                  {item.image ? (
                    <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">No image</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-2 text-sm font-bold leading-5 text-text-primary">{item.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {item.condition && <span className="badge-gray">{item.condition}</span>}
                    {item.buyingOptions?.map((option) => <span key={option} className="badge-blue">{option.replace('_', ' ')}</span>)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-green">{item.price?.display || '-'}</p>
                      <p className="text-xs text-text-muted">Shipping {item.shipping?.display || 'not shown'}</p>
                    </div>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="btn-ghost-sm">
                        View
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
