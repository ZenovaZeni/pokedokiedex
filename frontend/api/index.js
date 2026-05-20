import { createHash, pbkdf2Sync } from 'node:crypto'
import { ConvexHttpClient } from 'convex/browser'
import { api as convexApi } from '../convex/_generated/api.js'

const sampleCard = {
  id: 'base1-58_en',
  tcg_card_id: 'base1-58',
  name: 'Pikachu',
  set_id: 'base1',
  number: '58',
  rarity: 'Common',
  types: ['Lightning'],
  supertype: 'Pokemon',
  hp: '60',
  artist: 'Mitsuhiro Arita',
  images_small: 'https://assets.tcgdex.net/en/base/base1/58/low.webp',
  images_large: 'https://assets.tcgdex.net/en/base/base1/58/high.webp',
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
    id: 'base1_en',
    tcg_set_id: 'base1',
    name: 'Base Set',
    series: 'Base',
    images_logo: 'https://assets.tcgdex.net/en/base/base1/logo.webp',
    images_symbol: 'https://assets.tcgdex.net/univ/base/base1/symbol.webp',
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
  currency: 'USD',
  price_primary: 'trend',
  price_display: '["trend", "avg1", "avg7", "avg30", "low"]',
  multi_user_mode: 'false',
  tcgdex_sync_languages: 'en',
  cross_language_price_fallback: 'false',
  cross_language_image_fallback: 'false',
  debug_mode: 'false',
}

let ebayTokenCache = {
  token: '',
  expiresAt: 0,
}

const memoryCache = new Map()
const providerWindows = new Map()

const PROVIDER_LIMITS = {
  tcgdex: { limit: 120, windowMs: 60 * 1000, timeoutMs: 10000 },
  pokemonTcgPublic: { limit: 80, windowMs: 60 * 60 * 1000, timeoutMs: 9000 },
  pokemonTcgKey: { limit: 900, windowMs: 60 * 60 * 1000, timeoutMs: 9000 },
  carddexPublic: { limit: 25, windowMs: 60 * 1000, timeoutMs: 4000 },
  carddexKey: { limit: 90, windowMs: 60 * 1000, timeoutMs: 4000 },
  opentcg: { limit: 600, windowMs: 60 * 1000, timeoutMs: 3000 },
  ebayAuth: { limit: 50, windowMs: 60 * 60 * 1000, timeoutMs: 9000 },
  ebayBrowse: { limit: 4500, windowMs: 24 * 60 * 60 * 1000, timeoutMs: 9000 },
}

function cacheKey(provider, url, options = {}) {
  const headerKeys = ['x-api-key', 'x-ebay-c-marketplace-id']
  const headers = options.headers || {}
  const safeHeaders = headerKeys
    .map((key) => `${key}:${headers[key] || headers[key.toUpperCase()] || ''}`)
    .join('|')
  return `${provider}:${url}:${safeHeaders}`
}

function getCached(key) {
  const hit = memoryCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return null
  }
  return hit.value
}

function setCached(key, value, ttlMs) {
  if (!ttlMs) return
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
  if (memoryCache.size > 1000) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) memoryCache.delete(firstKey)
  }
}

function checkProviderLimit(provider) {
  const limitConfig = PROVIDER_LIMITS[provider]
  if (!limitConfig) return
  const now = Date.now()
  const windowState = providerWindows.get(provider) || { startedAt: now, count: 0 }
  if (now - windowState.startedAt >= limitConfig.windowMs) {
    providerWindows.set(provider, { startedAt: now, count: 1 })
    return
  }
  if (windowState.count >= limitConfig.limit) {
    const error = new Error(`${provider} free-tier limit reached. Try again after the provider window resets.`)
    error.status = 429
    error.code = 'PROVIDER_RATE_LIMITED'
    throw error
  }
  windowState.count += 1
  providerWindows.set(provider, windowState)
}

async function providerJson(provider, url, options = {}, config = {}) {
  const limitConfig = PROVIDER_LIMITS[provider] || {}
  const key = cacheKey(provider, url, options)
  const cached = getCached(key)
  if (cached) return { data: cached, cache: 'hit' }

  checkProviderLimit(provider)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || limitConfig.timeoutMs || 8000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error?.message || data.errors?.[0]?.message || data.message || `${provider} request failed`)
      error.status = response.status
      error.code = `${provider.toUpperCase()}_REQUEST_FAILED`
      throw error
    }
    setCached(key, data, config.ttlMs)
    return { data, cache: 'miss' }
  } finally {
    clearTimeout(timeout)
  }
}

function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(data))
}

function ebayConfig() {
  const clientId = process.env.EBAY_CLIENT_ID || ''
  const clientSecret = process.env.EBAY_CLIENT_SECRET || ''
  const env = (process.env.EBAY_ENV || 'production').toLowerCase()
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || 'EBAY_US'
  const apiBase = env === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'

  return {
    clientId,
    clientSecret,
    env,
    marketplaceId,
    apiBase,
    configured: Boolean(clientId && clientSecret),
  }
}

async function getEbayAccessToken(config) {
  const now = Date.now()
  if (ebayTokenCache.token && ebayTokenCache.expiresAt > now + 60000) {
    return ebayTokenCache.token
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  })

  checkProviderLimit('ebayAuth')
  const response = await fetch(`${config.apiBase}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'eBay authentication failed')
  }

  ebayTokenCache = {
    token: data.access_token,
    expiresAt: now + Math.max(60, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return ebayTokenCache.token
}

function moneyValue(amount) {
  if (!amount) return null
  const value = Number(amount.value)
  if (!Number.isFinite(value)) return null
  return {
    value,
    currency: amount.currency || 'USD',
    display: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: amount.currency || 'USD',
    }).format(value),
  }
}

function summarizeEbayItems(items = []) {
  const prices = items
    .map((item) => Number(item.price?.value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!prices.length) return { count: items.length, min: null, median: null, max: null }

  const middle = Math.floor(prices.length / 2)
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2

  return {
    count: items.length,
    min: prices[0],
    median,
    max: prices[prices.length - 1],
  }
}

async function ebayResponse(req, res, path, url) {
  if (path === 'providers/status') {
    const pokemonProvider = pokemonTcgProviderName()
    const ebay = ebayConfig()
    send(res, 200, {
      free_fallbacks_enabled: process.env.ENABLE_FREE_PROVIDER_FALLBACKS !== 'false',
      providers: [
        {
          id: 'tcgdex',
          name: 'TCGdex',
          configured: true,
          role: 'primary catalog and pricing',
          rate_limit: PROVIDER_LIMITS.tcgdex,
        },
        {
          id: 'pokemon-tcg-api',
          name: 'Pokemon TCG API',
          configured: true,
          role: 'free metadata/image/price fallback',
          api_key_configured: Boolean(process.env.POKEMON_TCG_API_KEY),
          rate_limit: PROVIDER_LIMITS[pokemonProvider],
        },
        {
          id: 'ebay',
          name: 'eBay Browse API',
          configured: ebay.configured,
          role: 'active listing comps',
          required_env: ebay.configured ? [] : ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'],
          rate_limit: PROVIDER_LIMITS.ebayBrowse,
        },
        {
          id: 'carddex',
          name: 'CardDex',
          configured: Boolean(process.env.CARDDEX_API_KEY),
          role: 'optional beta fallback, key-supported',
          required_env: ['CARDDEX_API_KEY'],
          rate_limit: process.env.CARDDEX_API_KEY ? PROVIDER_LIMITS.carddexKey : PROVIDER_LIMITS.carddexPublic,
        },
        {
          id: 'opentcg',
          name: 'OpenTCG',
          configured: process.env.ENABLE_OPENTCG_FALLBACK === 'true',
          role: 'optional experimental catalog fallback',
          optional_env: ['ENABLE_OPENTCG_FALLBACK=true'],
          rate_limit: PROVIDER_LIMITS.opentcg,
        },
      ],
    })
    return true
  }

  if (path === 'ebay/status') {
    const config = ebayConfig()
    send(res, 200, {
      configured: config.configured,
      marketplace_id: config.marketplaceId,
      environment: config.env,
    })
    return true
  }

  if (path !== 'ebay/search') return false

  if (req.method !== 'GET') {
    send(res, 405, { detail: 'Method not allowed' })
    return true
  }

  const config = ebayConfig()
  if (!config.configured) {
    send(res, 503, {
      detail: 'eBay API is not configured yet.',
      code: 'EBAY_NOT_CONFIGURED',
      required_env: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'],
      optional_env: ['EBAY_MARKETPLACE_ID', 'EBAY_ENV'],
    })
    return true
  }

  const q = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ')
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') || 8)))
  if (q.length < 2) {
    send(res, 400, { detail: 'Search query must be at least 2 characters.' })
    return true
  }

  try {
    const token = await getEbayAccessToken(config)
    const searchUrl = new URL(`${config.apiBase}/buy/browse/v1/item_summary/search`)
    searchUrl.searchParams.set('q', q)
    searchUrl.searchParams.set('limit', String(limit))
    searchUrl.searchParams.set('sort', 'price')

    const { data } = await providerJson('ebayBrowse', searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId,
      },
    }, { ttlMs: 10 * 60 * 1000 })

    const items = (data.itemSummaries || []).map((item) => ({
      id: item.itemId,
      title: item.title,
      url: item.itemWebUrl,
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
      price: moneyValue(item.price),
      shipping: moneyValue(item.shippingOptions?.[0]?.shippingCost),
      condition: item.condition,
      buyingOptions: item.buyingOptions || [],
      itemEndDate: item.itemEndDate,
      seller: item.seller
        ? {
            username: item.seller.username,
            feedbackPercentage: item.seller.feedbackPercentage,
            feedbackScore: item.seller.feedbackScore,
          }
        : null,
    }))

    send(res, 200, {
      query: q,
      source: 'eBay Browse API active listings',
      marketplace_id: config.marketplaceId,
      total: data.total || items.length,
      summary: summarizeEbayItems(items),
      items,
    })
    return true
  } catch (error) {
    send(res, 502, { detail: error.message || 'eBay request failed', code: 'EBAY_REQUEST_FAILED' })
    return true
  }
}

function authToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
}

function convexClient() {
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL
  return convexUrl ? new ConvexHttpClient(convexUrl) : null
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function passwordHash(username, password) {
  const normalizedUsername = username.trim().toLowerCase()
  return pbkdf2Sync(password, `pokedokiedex-v2:${normalizedUsername}`, 120000, 32, 'sha256').toString('hex')
}

function legacyPasswordHash(username, password) {
  return createHash('sha256')
    .update(`${username.trim().toLowerCase()}:${password}:pokedokiedex-v1`)
    .digest('hex')
}

function tcgdexId(cardId = '') {
  return String(cardId).replace(/_en$/, '')
}

function priceFromPricing(card, key) {
  const value = card?.pricing?.tcgplayer?.prices?.normal?.[key]
    ?? card?.pricing?.tcgplayer?.prices?.holofoil?.[key]
    ?? card?.pricing?.tcgplayer?.prices?.reverseHolofoil?.[key]
    ?? card?.pricing?.cardmarket?.[key]
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value)
    if (number !== null) return number
  }
  return null
}

function normalizeTcgdexCard(card) {
  const image = card.image || ''
  const set = card.set || {}
  return {
    id: `${card.id}_en`,
    tcg_card_id: card.id,
    name: card.name,
    set_id: set.id || '',
    number: card.localId || '',
    rarity: card.rarity || '',
    types: card.types || [],
    supertype: card.category || '',
    hp: card.hp ? String(card.hp) : '',
    artist: card.illustrator || '',
    images_small: image ? `${image}/low.webp` : '',
    images_large: image ? `${image}/high.webp` : '',
    lang: 'en',
    price_market: priceFromPricing(card, 'market') ?? priceFromPricing(card, 'trend') ?? priceFromPricing(card, 'avg'),
    price_low: priceFromPricing(card, 'low'),
    price_mid: priceFromPricing(card, 'mid'),
    price_high: priceFromPricing(card, 'high'),
    price_trend: priceFromPricing(card, 'trend') ?? priceFromPricing(card, 'market'),
    price_avg1: priceFromPricing(card, 'avg1'),
    price_avg7: priceFromPricing(card, 'avg7'),
    price_avg30: priceFromPricing(card, 'avg30'),
    attacks: card.attacks || [],
    weaknesses: card.weaknesses || [],
    retreatCost: card.retreat || card.retreatCost || [],
    rules: card.rules || [],
    legalities: card.legal || card.legalities || null,
    data_sources: ['TCGdex'],
    price_sources: card.pricing ? ['TCGdex marketplace mapping'] : [],
    price_confidence: card.pricing ? 'medium' : 'missing',
    set_ref: {
      id: set.id ? `${set.id}_en` : '',
      tcg_set_id: set.id || '',
      name: set.name || '',
      series: set.serie?.name || set.series || '',
      abbreviation: set.abbreviation?.official || '',
      images_logo: set.logo ? `${set.logo}.webp` : '',
      images_symbol: set.symbol ? `${set.symbol}.webp` : '',
    },
  }
}

function pokemonTcgHeaders() {
  const apiKey = process.env.POKEMON_TCG_API_KEY || ''
  return apiKey ? { 'X-Api-Key': apiKey } : {}
}

function pokemonTcgProviderName() {
  return process.env.POKEMON_TCG_API_KEY ? 'pokemonTcgKey' : 'pokemonTcgPublic'
}

function pokemonTcgPrice(card, variant, key) {
  return numberOrNull(card?.tcgplayer?.prices?.[variant]?.[key])
}

function normalizePokemonTcgCard(card) {
  const prices = card.tcgplayer?.prices || {}
  const market = firstNumber(
    pokemonTcgPrice(card, 'normal', 'market'),
    pokemonTcgPrice(card, 'holofoil', 'market'),
    pokemonTcgPrice(card, 'reverseHolofoil', 'market'),
    card.cardmarket?.prices?.averageSellPrice,
    card.cardmarket?.prices?.trendPrice
  )
  const low = firstNumber(
    pokemonTcgPrice(card, 'normal', 'low'),
    pokemonTcgPrice(card, 'holofoil', 'low'),
    pokemonTcgPrice(card, 'reverseHolofoil', 'low'),
    card.cardmarket?.prices?.lowPrice
  )
  const high = firstNumber(
    pokemonTcgPrice(card, 'normal', 'high'),
    pokemonTcgPrice(card, 'holofoil', 'high'),
    pokemonTcgPrice(card, 'reverseHolofoil', 'high')
  )
  const set = card.set || {}

  return {
    id: `${card.id}_en`,
    tcg_card_id: card.id,
    name: card.name,
    set_id: set.id || '',
    number: card.number || '',
    rarity: card.rarity || '',
    types: card.types || [],
    supertype: card.supertype || '',
    hp: card.hp ? String(card.hp) : '',
    artist: card.artist || '',
    images_small: card.images?.small || '',
    images_large: card.images?.large || '',
    lang: 'en',
    price_market: market,
    price_low: low,
    price_mid: firstNumber(pokemonTcgPrice(card, 'normal', 'mid'), pokemonTcgPrice(card, 'holofoil', 'mid'), pokemonTcgPrice(card, 'reverseHolofoil', 'mid')),
    price_high: high,
    price_trend: firstNumber(card.cardmarket?.prices?.trendPrice, market),
    price_avg1: null,
    price_avg7: null,
    price_avg30: null,
    price_tcg_normal_market: pokemonTcgPrice(card, 'normal', 'market'),
    price_tcg_reverse_market: pokemonTcgPrice(card, 'reverseHolofoil', 'market'),
    price_tcg_holo_market: pokemonTcgPrice(card, 'holofoil', 'market'),
    attacks: card.attacks || [],
    weaknesses: card.weaknesses || [],
    retreatCost: card.retreatCost || [],
    rules: card.rules || [],
    legalities: card.legalities || null,
    data_sources: ['Pokemon TCG API'],
    price_sources: Object.keys(prices).length || card.cardmarket?.prices ? ['Pokemon TCG API'] : [],
    price_confidence: market ? 'medium' : 'missing',
    set_ref: {
      id: set.id ? `${set.id}_en` : '',
      tcg_set_id: set.id || '',
      name: set.name || '',
      series: set.series || '',
      abbreviation: set.ptcgoCode || '',
      images_logo: set.images?.logo || '',
      images_symbol: set.images?.symbol || '',
    },
  }
}

function mergeProviderCard(primary, fallback) {
  if (!primary) return fallback
  if (!fallback) return primary
  const merged = { ...primary }
  for (const [key, value] of Object.entries(fallback)) {
    const current = merged[key]
    const missing = current == null || current === '' || (Array.isArray(current) && current.length === 0)
    if (missing && value != null && value !== '') merged[key] = value
  }
  merged.data_sources = [...new Set([...(primary.data_sources || []), ...(fallback.data_sources || [])])]
  merged.price_sources = [...new Set([...(primary.price_sources || []), ...(fallback.price_sources || [])])]
  const priceChecks = [
    merged.price_market,
    merged.price_trend,
    merged.price_tcg_normal_market,
    merged.price_tcg_holo_market,
    merged.price_tcg_reverse_market,
  ].filter((value) => numberOrNull(value) !== null)
  merged.price_confidence = priceChecks.length >= 2 ? 'high' : priceChecks.length === 1 ? 'medium' : 'missing'
  return merged
}

function pokemonQueryValue(value = '') {
  return String(value).trim().replace(/"/g, '\\"')
}

async function fetchPokemonTcgCard(cardId) {
  const id = tcgdexId(cardId)
  const url = `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}`
  const { data } = await providerJson(pokemonTcgProviderName(), url, {
    headers: pokemonTcgHeaders(),
  }, { ttlMs: 24 * 60 * 60 * 1000 })
  return data?.data ? normalizePokemonTcgCard(data.data) : null
}

async function searchPokemonTcgCards(url) {
  const name = (url.searchParams.get('name') || '').trim()
  const setId = (url.searchParams.get('set_id') || '').replace(/_en$/, '')
  const type = url.searchParams.get('type') || ''
  const rarity = (url.searchParams.get('rarity') || '').trim()
  const artist = (url.searchParams.get('artist') || '').trim()
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size') || 20)))
  if (!name && !setId && !type && !rarity && !artist) return { data: [], total_count: 0, page, page_size: pageSize }

  const q = []
  const codeMatch = /^([A-Za-z]+\d*)\s+(\d+)$/i.exec(name)
  if (setId) q.push(`set.id:${pokemonQueryValue(setId)}`)
  if (codeMatch && !setId) {
    q.push(`set.id:${pokemonQueryValue(codeMatch[1])}`)
    q.push(`number:${pokemonQueryValue(codeMatch[2])}`)
  } else if (name) {
    q.push(`name:"${pokemonQueryValue(name)}"`)
  }
  if (type) q.push(`types:${pokemonQueryValue(type)}`)
  if (rarity) q.push(`rarity:"${pokemonQueryValue(rarity)}"`)
  if (artist) q.push(`artist:"${pokemonQueryValue(artist)}"`)

  const searchUrl = new URL('https://api.pokemontcg.io/v2/cards')
  searchUrl.searchParams.set('q', q.join(' '))
  searchUrl.searchParams.set('page', String(page))
  searchUrl.searchParams.set('pageSize', String(pageSize))
  const { data } = await providerJson(pokemonTcgProviderName(), searchUrl.toString(), {
    headers: pokemonTcgHeaders(),
  }, { ttlMs: 30 * 60 * 1000 })
  const cards = Array.isArray(data?.data) ? data.data.map(normalizePokemonTcgCard) : []
  return {
    data: cards,
    total_count: data?.totalCount ?? cards.length,
    page: data?.page ?? page,
    page_size: data?.pageSize ?? pageSize,
  }
}

async function fetchCardForCollection(cardId) {
  const id = tcgdexId(cardId)
  try {
    return await fetchMergedCard(id)
  } catch {
    const fallback = await fetchPokemonTcgCard(id)
    if (fallback) return fallback
    throw new Error('Card was not found in the US card catalog.')
  }
}

async function tcgdexJson(path, params = {}) {
  const url = new URL(`https://api.tcgdex.net/v2/en/${path.replace(/^\//, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const { data } = await providerJson('tcgdex', url.toString(), {}, { ttlMs: 6 * 60 * 60 * 1000 })
  return data
}

function withWebp(url) {
  if (!url) return ''
  return /\.(webp|png|jpe?g)$/i.test(url) ? url : `${url}.webp`
}

function normalizeSet(set) {
  const total = set.cardCount?.total ?? set.total ?? 0
  return {
    id: `${set.id}_en`,
    tcg_set_id: set.id,
    name: set.name,
    series: set.serie?.name || set.series || '',
    abbreviation: set.abbreviation?.official || '',
    total,
    release_date: set.releaseDate || '',
    images_logo: withWebp(set.logo),
    images_symbol: withWebp(set.symbol),
    lang: 'en',
    owned_count: 0,
  }
}

async function normalizeCardSearchResult(card) {
  if (card?.pricing || card?.category || card?.set?.cardCount) return normalizeTcgdexCard(card)
  try {
    return normalizeTcgdexCard(await tcgdexJson(`cards/${encodeURIComponent(card.id)}`))
  } catch {
    const image = card.image || ''
    return {
      id: `${card.id}_en`,
      tcg_card_id: card.id,
      name: card.name,
      set_id: card.id?.includes('-') ? card.id.split('-').slice(0, -1).join('-') : '',
      number: card.localId || '',
      localId: card.localId || '',
      rarity: card.rarity || '',
      types: [],
      supertype: '',
      hp: '',
      artist: '',
      images_small: image ? `${image}/low.webp` : '',
      images_large: image ? `${image}/high.webp` : '',
      image: image ? `${image}/low.webp` : '',
      lang: 'en',
      price_market: null,
      price_low: null,
      price_trend: null,
      price_avg1: null,
      price_avg7: null,
      price_avg30: null,
      set_ref: null,
    }
  }
}

async function fetchMergedCard(cardId) {
  const id = tcgdexId(cardId)
  let primary = null
  let fallback = null
  try {
    primary = normalizeTcgdexCard(await tcgdexJson(`cards/${encodeURIComponent(id)}`))
  } catch {}
  try {
    fallback = await fetchPokemonTcgCard(id)
  } catch {}
  const merged = mergeProviderCard(primary, fallback)
  if (!merged) throw new Error('Card was not found in the free card catalogs.')
  return merged
}

function mergeSearchProviderResults(primaryResult, fallbackResult) {
  const map = new Map()
  const add = (card) => {
    const key = tcgdexId(card.tcg_card_id || card.id || card.card_id)
    const existing = map.get(key)
    map.set(key, existing ? mergeProviderCard(existing, card) : card)
  }
  ;(primaryResult?.data || []).forEach(add)
  ;(fallbackResult?.data || []).forEach(add)
  const pageSize = primaryResult?.page_size || fallbackResult?.page_size || 20
  return {
    data: Array.from(map.values()).slice(0, pageSize),
    total_count: Math.max(primaryResult?.total_count || 0, fallbackResult?.total_count || 0, map.size),
    page: primaryResult?.page || fallbackResult?.page || 1,
    page_size: pageSize,
    providers: {
      primary: 'TCGdex',
      fallback: fallbackResult ? 'Pokemon TCG API' : null,
    },
  }
}

function stripNumber(value = '') {
  const match = String(value).match(/[A-Za-z0-9-]+/)
  return match ? match[0].replace(/^0+/, '') || '0' : ''
}

async function searchTcgdexCards(url) {
  const name = (url.searchParams.get('name') || '').trim()
  const setId = (url.searchParams.get('set_id') || '').replace(/_en$/, '')
  const type = url.searchParams.get('type') || ''
  const rarity = (url.searchParams.get('rarity') || '').toLowerCase()
  const artist = (url.searchParams.get('artist') || '').toLowerCase()
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size') || 20)))

  let raw = []
  const codeMatch = /^([A-Za-z]+\d*)\s+(\d+)$/i.exec(name)

  if (setId) {
    const set = await tcgdexJson(`sets/${encodeURIComponent(setId)}`)
    raw = Array.isArray(set.cards) ? set.cards : []
  } else if (codeMatch) {
    const [, wantedSet, wantedNumber] = codeMatch
    const sets = await tcgdexJson('sets')
    const matchedSet = sets.find((set) => {
      const official = set.abbreviation?.official || ''
      return [set.id, official].some((candidate) => candidate.toLowerCase() === wantedSet.toLowerCase())
    })
    if (matchedSet) {
      const set = await tcgdexJson(`sets/${encodeURIComponent(matchedSet.id)}`)
      raw = (set.cards || []).filter((card) => stripNumber(card.localId) === stripNumber(wantedNumber))
    }
  } else if (name) {
    raw = await tcgdexJson('cards', { name })
  } else {
    raw = []
  }

  if (type) raw = raw.filter((card) => (card.types || []).includes(type))
  if (rarity) raw = raw.filter((card) => String(card.rarity || '').toLowerCase().includes(rarity))

  const totalCount = raw.length
  const pageRaw = raw.slice((page - 1) * pageSize, page * pageSize)
  let cards = await Promise.all(pageRaw.map(normalizeCardSearchResult))
  if (artist) cards = cards.filter((card) => String(card.artist || '').toLowerCase().includes(artist))

  const primaryResult = {
    data: cards,
    total_count: totalCount,
    page,
    page_size: pageSize,
  }

  if (process.env.ENABLE_FREE_PROVIDER_FALLBACKS === 'false') return primaryResult

  try {
    const fallbackResult = await searchPokemonTcgCards(url)
    return mergeSearchProviderResults(primaryResult, fallbackResult)
  } catch (error) {
    return {
      ...primaryResult,
      providers: {
        primary: 'TCGdex',
        fallback_error: error.code || error.message || 'Pokemon TCG API fallback unavailable',
      },
    }
  }
}

function multipartFile(buffer, contentType = '') {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1]
    || /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2]
  if (!boundary) return null
  const boundaryBytes = Buffer.from(`--${boundary}`)
  const start = buffer.indexOf(boundaryBytes)
  if (start < 0) return null
  const headerStart = buffer.indexOf(Buffer.from('\r\n'), start) + 2
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart)
  if (headerEnd < 0) return null
  const headers = buffer.slice(headerStart, headerEnd).toString('utf8')
  const fileStart = headerEnd + 4
  const nextBoundary = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), fileStart)
  if (nextBoundary < 0 || !/name="file"/i.test(headers)) return null
  const mime = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || 'image/jpeg'
  return { bytes: buffer.slice(fileStart, nextBoundary), mime }
}

async function geminiRecognize(req) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    const error = new Error('Card scanning needs a Gemini API key configured on Vercel before photo recognition can run.')
    error.status = 503
    error.code = 'SCANNER_NOT_CONFIGURED'
    throw error
  }

  const body = await readRawBody(req)
  const file = multipartFile(body, req.headers['content-type'] || '')
  if (!file?.bytes?.length) {
    const error = new Error('No card image was received.')
    error.status = 400
    throw error
  }

  const prompt = `Read this Pokemon trading card image. Return only JSON with:
{"name":"English card name if visible","number":"printed collector number like 58/102 or null","set_hint":"set name or code if visible or null","language":"en"}`

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: file.mime, data: file.bytes.toString('base64') } },
        ],
      }],
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Photo recognition failed.')
    error.status = response.status
    throw error
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const jsonText = /\{[\s\S]*\}/.exec(text)?.[0]
  const recognized = jsonText ? JSON.parse(jsonText) : {}
  const query = recognized.name || recognized.set_hint || ''
  if (!query) {
    const error = new Error('The card name was not readable. Try a brighter photo or use smart search.')
    error.status = 422
    throw error
  }

  const searchUrl = new URL('https://pokedokiedex.vercel.app/api/cards/search')
  searchUrl.searchParams.set('name', query)
  searchUrl.searchParams.set('page_size', '12')
  const result = await searchTcgdexCards(searchUrl)
  const targetNumber = stripNumber(recognized.number)
  const matches = result.data
    .sort((a, b) => {
      if (!targetNumber) return 0
      const aMatch = stripNumber(a.number || a.localId) === targetNumber ? 0 : 1
      const bMatch = stripNumber(b.number || b.localId) === targetNumber ? 0 : 1
      return aMatch - bMatch
    })
    .slice(0, 8)
    .map((card) => ({
      ...card,
      image: card.images_small,
      set_abbreviation: card.set_ref?.abbreviation || card.set_id,
      lang: 'en',
      _lang: 'en',
    }))

  return {
    recognized: { ...recognized, language: 'en' },
    matches,
  }
}

async function currentConvexCollection(req) {
  const token = authToken(req)
  const convex = convexClient()
  if (!token || !convex) return []
  try {
    return await convex.query(convexApi.cards.collection, { token })
  } catch {
    return []
  }
}

function roundProgress(cards) {
  if (!cards.length) return 0
  return Math.round((cards.filter((card) => card.owned).length / cards.length) * 1000) / 10
}

async function tcgdexResponse(req, res, path, url) {
  try {
    const cardImageMatch = /^images\/card\/([^/]+)\/(small|large)$/.exec(path)
    if (cardImageMatch && req.method === 'GET') {
      const [, rawCardId, size] = cardImageMatch
      const card = await tcgdexJson(`cards/${encodeURIComponent(tcgdexId(decodeURIComponent(rawCardId)))}`)
      const imageBase = card.image || ''
      if (!imageBase) throw new Error('Card image is not available.')
      res.statusCode = 302
      res.setHeader('location', `${imageBase}/${size === 'large' ? 'high' : 'low'}.webp`)
      return res.end()
    }

    const setImageMatch = /^images\/set\/([^/]+)\/(logo|symbol)$/.exec(path)
    if (setImageMatch && req.method === 'GET') {
      const [, rawSetId, imageType] = setImageMatch
      const setId = decodeURIComponent(rawSetId).replace(/_en$/, '')
      const set = await tcgdexJson(`sets/${encodeURIComponent(setId)}`)
      const imageBase = imageType === 'logo' ? set.logo : set.symbol
      if (!imageBase) throw new Error('Set image is not available.')
      res.statusCode = 302
      res.setHeader('location', withWebp(imageBase))
      return res.end()
    }

    if (path === 'cards/search' && req.method === 'GET') {
      send(res, 200, await searchTcgdexCards(url))
      return true
    }

    const cardDetailMatch = /^cards\/([^/]+)$/.exec(path)
    if (cardDetailMatch && req.method === 'GET') {
      send(res, 200, await fetchMergedCard(decodeURIComponent(cardDetailMatch[1])))
      return true
    }

    if (path === 'cards/recognize' && req.method === 'POST') {
      send(res, 200, await geminiRecognize(req))
      return true
    }

    if (path === 'sets' && req.method === 'GET') {
      const sets = await tcgdexJson('sets')
      const collection = await currentConvexCollection(req)
      const ownedBySet = new Map()
      for (const item of collection) {
        const setId = item.card?.set_id
        if (!setId) continue
        ownedBySet.set(setId, (ownedBySet.get(setId) || 0) + 1)
      }
      send(res, 200, sets.map((set) => ({
        ...normalizeSet(set),
        owned_count: ownedBySet.get(set.id) || 0,
      })).reverse())
      return true
    }

    const checklistMatch = /^sets\/([^/]+)\/checklist$/.exec(path)
    if (checklistMatch && req.method === 'GET') {
      const setId = checklistMatch[1].replace(/_en$/, '')
      const set = await tcgdexJson(`sets/${encodeURIComponent(setId)}`)
      const cards = await Promise.all((set.cards || []).map(normalizeCardSearchResult))
      const collection = await currentConvexCollection(req)
      const ownedMap = new Map(collection.map((item) => [item.card_id, item.quantity || 0]))
      const checklist = cards.map((card) => ({
        ...card,
        owned: ownedMap.has(card.id),
        quantity: ownedMap.get(card.id) || 0,
      }))
      send(res, 200, {
        set: normalizeSet(set),
        cards: checklist,
        owned_count: checklist.filter((card) => card.owned).length,
        total_count: checklist.length,
        progress: roundProgress(checklist),
      })
      return true
    }

    const setMatch = /^sets\/([^/]+)$/.exec(path)
    if (setMatch && req.method === 'GET') {
      send(res, 200, normalizeSet(await tcgdexJson(`sets/${encodeURIComponent(setMatch[1].replace(/_en$/, ''))}`)))
      return true
    }
  } catch (error) {
    send(res, error.status || 502, {
      detail: error.message || 'Card catalog request failed',
      code: error.code || 'TCGDEX_REQUEST_FAILED',
    })
    return true
  }

  return false
}

async function convexResponse(req, res, path) {
  const convex = convexClient()
  if (!convex) return false

  if (path === 'auth/mode') {
    send(res, 200, { multi_user: true })
    return true
  }

  if (path === 'auth/login') {
    const body = await readBody(req)
    const params = new URLSearchParams(body)
    const username = params.get('username') || ''
    const password = params.get('password') || ''
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
      send(res, 400, { detail: 'Use 3-32 letters, numbers, dots, dashes, or underscores.' })
      return true
    }
    if (password.length < 8) {
      send(res, 400, { detail: 'Password must be at least 8 characters.' })
      return true
    }
    try {
      const data = await convex.mutation(convexApi.accounts.loginOrCreate, {
        username,
        passwordHash: passwordHash(username, password),
        legacyPasswordHash: legacyPasswordHash(username, password),
      })
      send(res, 200, data)
    } catch (error) {
      send(res, 401, { detail: error.message || 'Login failed' })
    }
    return true
  }

  if (path === 'auth/logout') {
    const token = authToken(req)
    if (token) await convex.mutation(convexApi.accounts.logout, { token })
    send(res, 200, { ok: true })
    return true
  }

  if (path === 'auth/me') {
    const token = authToken(req)
    if (!token) {
      send(res, 401, { detail: 'Not authenticated' })
      return true
    }
    const user = await convex.query(convexApi.accounts.me, { token })
    send(res, user ? 200 : 401, user || { detail: 'Not authenticated' })
    return true
  }

  const token = authToken(req)
  if (!token && ['collection', 'dashboard', 'settings'].includes(path)) {
    send(res, 401, { detail: 'Not authenticated' })
    return true
  }

  if (path === 'collection') {
    if (req.method === 'GET') {
      send(res, 200, await convex.query(convexApi.cards.collection, { token }))
      return true
    }
    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req) || '{}')
        const card = await fetchCardForCollection(body.card_id)
        const item = await convex.mutation(convexApi.cards.addCollectionItem, {
          token,
          cardId: card.id,
          quantity: Number(body.quantity || 1),
          condition: body.condition || 'NM',
          variant: body.variant || undefined,
          purchasePrice: body.purchase_price == null ? undefined : Number(body.purchase_price),
          card,
        })
        send(res, 200, item)
      } catch (error) {
        send(res, 400, { detail: error.message || 'Could not add card to collection' })
      }
      return true
    }
  }

  if (path === 'collection/bulk-add' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const items = Array.isArray(body.items) ? body.items : []
    const prepared = []
    const failedItems = []

    for (const item of items) {
      try {
        prepared.push({
          cardId: `${tcgdexId(item.card_id)}_en`,
          quantity: Number(item.quantity || 1),
          condition: item.condition || 'NM',
          variant: item.variant || undefined,
          purchasePrice: item.purchase_price == null ? undefined : Number(item.purchase_price),
          card: await fetchCardForCollection(item.card_id),
        })
      } catch (error) {
        failedItems.push({ card_id: item.card_id, error: error.message || 'Card lookup failed' })
      }
    }

    const result = prepared.length
      ? await convex.mutation(convexApi.cards.bulkAddCollectionItems, { token, items: prepared })
      : { added: 0, updated: 0 }
    send(res, 200, {
      ...result,
      failed: failedItems.length,
      failed_items: failedItems,
    })
    return true
  }

  if (path.startsWith('collection/') && req.method === 'PUT') {
    const body = JSON.parse(await readBody(req) || '{}')
    await convex.mutation(convexApi.cards.updateCollectionItem, {
      token,
      id: path.split('/')[1],
      quantity: Number(body.quantity || 1),
      condition: body.condition || 'NM',
      variant: body.variant || '',
      purchase_price: body.purchase_price == null ? undefined : Number(body.purchase_price),
    })
    send(res, 200, { ok: true })
    return true
  }

  if (path.startsWith('collection/') && req.method === 'DELETE') {
    await convex.mutation(convexApi.cards.deleteCollectionItem, {
      token,
      id: path.split('/')[1],
    })
    send(res, 200, { ok: true })
    return true
  }

  if (path === 'dashboard') {
    send(res, 200, await convex.query(convexApi.cards.dashboard, { token }))
    return true
  }

  if (path === 'settings') {
    send(res, 200, settings)
    return true
  }

  return false
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://pokedokiedex.vercel.app')
  const path = (url.searchParams.get('path') || '').replace(/\/$/, '')

  if (await ebayResponse(req, res, path, url)) return

  if (await convexResponse(req, res, path)) return

  if (await tcgdexResponse(req, res, path, url)) return

  if (req.method === 'OPTIONS') return send(res, 200, {})
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') {
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
  if (path.startsWith('images/card/')) {
    const size = path.endsWith('/large') ? 'high' : 'low'
    res.statusCode = 302
    res.setHeader('location', `https://assets.tcgdex.net/en/base/base1/58/${size}.webp`)
    return res.end()
  }

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
