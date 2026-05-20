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

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId,
      },
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      send(res, response.status, {
        detail: data.errors?.[0]?.message || data.message || 'eBay search failed',
        code: 'EBAY_SEARCH_FAILED',
      })
      return true
    }

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

async function fetchCardForCollection(cardId) {
  const id = tcgdexId(cardId)
  const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error('Card was not found in the US card catalog.')
  return normalizeTcgdexCard(await response.json())
}

async function tcgdexJson(path, params = {}) {
  const url = new URL(`https://api.tcgdex.net/v2/en/${path.replace(/^\//, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`TCGdex request failed: ${response.status}`)
  return await response.json()
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

  return {
    data: cards,
    total_count: totalCount,
    page,
    page_size: pageSize,
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
    if (path === 'cards/search' && req.method === 'GET') {
      send(res, 200, await searchTcgdexCards(url))
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
