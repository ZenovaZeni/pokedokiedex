import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    username: v.string(),
    passwordHash: v.string(),
    role: v.string(),
    avatar_id: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_username', ['username']),

  sessions: defineTable({
    token: v.string(),
    userId: v.id('users'),
    createdAt: v.number(),
  }).index('by_token', ['token']),

  collection: defineTable({
    userId: v.id('users'),
    cardId: v.string(),
    quantity: v.number(),
    condition: v.string(),
    variant: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    addedAt: v.number(),
    card: v.any(),
  }).index('by_user', ['userId']),
})
