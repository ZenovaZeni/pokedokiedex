const sampleCard = {
  id: 'sv3pt5-25_en',
  tcg_card_id: 'sv3pt5-25',
  name: 'Pikachu',
  set_id: 'sv3pt5',
  number: '25',
  rarity: 'Common',
  types: ['Lightning'],
  supertype: 'Pokemon',
  hp: '60',
  artist: 'Mitsuhiro Arita',
  images_small: 'https://assets.tcgdex.net/en/sv/sv3pt5/25/low.webp',
  images_large: 'https://assets.tcgdex.net/en/sv/sv3pt5/25/high.webp',
  lang: 'en',
  price_market: 1.25,
  price_low: 0.42,
  price_mid: 1.25,
  price_high: 3.8,
  price_trend: 1.31,
  price_avg1: 1.24,
  price_avg7: 1.28,
  price_avg30: 1.35,
  set_ref: {
    id: 'sv3pt5_en',
    tcg_set_id: 'sv3pt5',
    name: '151',
    series: 'Scarlet & Violet',
    images_logo: 'https://assets.tcgdex.net/en/sv/sv3pt5/logo.webp',
    images_symbol: 'https://assets.tcgdex.net/univ/sv/sv3pt5/symbol.webp',
  },
}

const sampleCollection = [
  {
    id: 1,
    card_id: sampleCard.id,
    quantity: 3,
    condition: 'NM',
    variant: 'Normal',
    lang: 'en',
    purchase_price: 0.75,
    added_at: '2026-05-20T12:00:00Z',
    card: sampleCard,
  },
]

const settings = {
  language: 'en',
  currency: 'EUR',
  price_primary: 'trend',
  price_display: '["trend", "avg1", "avg7", "avg30", "low"]',
  multi_user_mode: 'false',
  tcgdex_sync_languages: 'en,de',
  cross_language_price_fallback: 'true',
  cross_language_image_fallback: 'true',
  debug_mode: 'false',
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}

export default function handler(req, res) {
  const url = new URL(req.url, 'https://pokedokiedex.vercel.app')
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '')

  if (req.method === 'OPTIONS') return send(res, 200, {})
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT') {
    return send(res, 405, { detail: 'Method not allowed in demo mode' })
  }

  if (path === 'auth/mode') return send(res, 200, { multi_user: false })
  if (path === 'auth/me') {
    return send(res, 200, {
      id: 1,
      username: 'admin',
      role: 'admin',
      avatar_id: 25,
      must_change_password: false,
    })
  }

  if (path === 'settings') return send(res, 200, settings)
  if (path.startsWith('settings/')) return send(res, 200, { key: path.split('/').pop(), value: '' })

  if (path === 'dashboard') {
    return send(res, 200, {
      total_cards: 3,
      unique_cards: 1,
      owned_sets: 1,
      total_value: 3.75,
      total_cost: 2.25,
      pnl: 1.5,
      products_realized_pnl: 0,
      products_sold_revenue: 0,
      products_sold_cost: 0,
      recent_additions: [sampleCard],
      top_cards: [{ ...sampleCard, total_value: 3.75 }],
    })
  }

  if (path === 'analytics/investment-tracker') {
    return send(res, 200, [
      { date: '2026-05-14T00:00:00Z', value: 2.25, cost: 2.25, pnl: 0 },
      { date: '2026-05-18T00:00:00Z', value: 3.15, cost: 2.25, pnl: 0.9 },
      { date: '2026-05-20T00:00:00Z', value: 3.75, cost: 2.25, pnl: 1.5 },
    ])
  }

  if (path === 'collection') return send(res, 200, sampleCollection)
  if (path === 'sets') return send(res, 200, [sampleCard.set_ref])
  if (path === 'sync/status') {
    return send(res, 200, {
      is_running: false,
      is_price_sync_running: false,
      last_sync: {
        status: 'demo',
        started_at: '2026-05-20T12:00:00Z',
        finished_at: '2026-05-20T12:00:03Z',
        cards_updated: 1,
        sync_type: 'price',
      },
      history: [],
    })
  }
  if (path === 'sync/prices' || path === 'sync') {
    return send(res, 200, { message: 'Demo price sync started', status: 'started' })
  }

  if (
    path === 'cards/custom/matches' ||
    path === 'cards/custom' ||
    path === 'wishlist' ||
    path === 'binders' ||
    path === 'products' ||
    path === 'analytics/duplicates' ||
    path === 'analytics/top-movers' ||
    path === 'analytics/rarity-stats' ||
    path === 'analytics/new-sets' ||
    path === 'github/contributors' ||
    path === 'github/supporters' ||
    path.startsWith('social/')
  ) {
    return send(res, 200, [])
  }

  if (path === 'products/summary' || path === 'settings/telegram_status') {
    return send(res, 200, {})
  }

  return send(res, 200, [])
}
