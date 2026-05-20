import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

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

async function userFromToken(ctx, token) {
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique()
  return session?.userId || null
}

function cleanVariant(variant) {
  return variant || ''
}

async function findCollectionRow(ctx, userId, cardId, variant) {
  const rows = await ctx.db
    .query('collection')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect()
  return rows.find((row) => row.cardId === cardId && cleanVariant(row.variant) === cleanVariant(variant)) || null
}

async function addItem(ctx, userId, item) {
  const existing = await findCollectionRow(ctx, userId, item.cardId, item.variant)
  const quantity = Math.max(1, Math.floor(item.quantity || 1))
  const purchasePrice = typeof item.purchasePrice === 'number' && Number.isFinite(item.purchasePrice)
    ? item.purchasePrice
    : undefined

  if (existing) {
    await ctx.db.patch(existing._id, {
      quantity: existing.quantity + quantity,
      condition: item.condition || existing.condition || 'NM',
      variant: item.variant || existing.variant,
      purchasePrice: purchasePrice ?? existing.purchasePrice,
      card: item.card || existing.card,
    })
    return { id: existing._id, status: 'updated' }
  }

  const id = await ctx.db.insert('collection', {
    userId,
    cardId: item.cardId,
    quantity,
    condition: item.condition || 'NM',
    variant: item.variant || undefined,
    purchasePrice,
    addedAt: Date.now(),
    card: item.card,
  })
  return { id, status: 'added' }
}

export const seedForUser = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')

    const existing = await ctx.db
      .query('collection')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first()
    if (existing) return existing._id

    return await ctx.db.insert('collection', {
      userId,
      cardId: sampleCard.id,
      quantity: 3,
      condition: 'NM',
      variant: 'Normal',
      purchasePrice: 0.75,
      addedAt: Date.now(),
      card: sampleCard,
    })
  },
})

export const addCollectionItem = mutation({
  args: {
    token: v.string(),
    cardId: v.string(),
    quantity: v.number(),
    condition: v.string(),
    variant: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    card: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')
    return await addItem(ctx, userId, args)
  },
})

export const bulkAddCollectionItems = mutation({
  args: {
    token: v.string(),
    items: v.array(v.object({
      cardId: v.string(),
      quantity: v.number(),
      condition: v.string(),
      variant: v.optional(v.string()),
      purchasePrice: v.optional(v.number()),
      card: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')

    let added = 0
    let updated = 0
    for (const item of args.items) {
      const result = await addItem(ctx, userId, item)
      if (result.status === 'added') added += 1
      if (result.status === 'updated') updated += 1
    }
    return { added, updated }
  },
})

export const collection = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')

    const rows = await ctx.db
      .query('collection')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    return rows.map((row) => ({
      id: row._id,
      card_id: row.cardId,
      quantity: row.quantity,
      condition: row.condition,
      variant: row.variant || '',
      lang: 'en',
      purchase_price: row.purchasePrice,
      added_at: new Date(row.addedAt).toISOString(),
      card: row.card,
    }))
  },
})

export const dashboard = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')

    const rows = await ctx.db
      .query('collection')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    const totalCards = rows.reduce((sum, row) => sum + row.quantity, 0)
    const totalValue = rows.reduce((sum, row) => sum + (row.card.price_market || 0) * row.quantity, 0)
    const totalCost = rows.reduce((sum, row) => sum + (row.purchasePrice || 0) * row.quantity, 0)
    const cards = rows.map((row) => ({ ...row.card, total_value: (row.card.price_market || 0) * row.quantity }))

    return {
      total_cards: totalCards,
      unique_cards: rows.length,
      owned_sets: new Set(rows.map((row) => row.card.set_id)).size,
      total_value: totalValue,
      total_cost: totalCost,
      pnl: totalValue - totalCost,
      products_realized_pnl: 0,
      products_sold_revenue: 0,
      products_sold_cost: 0,
      recent_additions: cards,
      top_cards: cards,
    }
  },
})

export const updateCollectionItem = mutation({
  args: {
    token: v.string(),
    id: v.id('collection'),
    quantity: v.number(),
    condition: v.string(),
    variant: v.optional(v.string()),
    purchase_price: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')
    const row = await ctx.db.get(args.id)
    if (!row || row.userId !== userId) throw new Error('Not found')

    await ctx.db.patch(args.id, {
      quantity: args.quantity,
      condition: args.condition,
      variant: args.variant,
      purchasePrice: args.purchase_price,
    })
    return { ok: true }
  },
})

export const deleteCollectionItem = mutation({
  args: {
    token: v.string(),
    id: v.id('collection'),
  },
  handler: async (ctx, args) => {
    const userId = await userFromToken(ctx, args.token)
    if (!userId) throw new Error('Unauthorized')
    const row = await ctx.db.get(args.id)
    if (!row || row.userId !== userId) throw new Error('Not found')
    await ctx.db.delete(args.id)
    return { ok: true }
  },
})
