import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const loginOrCreate = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase()
    if (!username || !args.passwordHash) {
      throw new Error('Username and password are required')
    }

    let user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()

    if (user && user.passwordHash !== args.passwordHash) {
      throw new Error('Invalid username or password')
    }

    if (!user) {
      const userId = await ctx.db.insert('users', {
        username,
        passwordHash: args.passwordHash,
        role: 'trainer',
        avatar_id: 25,
        createdAt: Date.now(),
      })
      user = await ctx.db.get(userId)
    }

    const token = crypto.randomUUID()
    await ctx.db.insert('sessions', {
      token,
      userId: user._id,
      createdAt: Date.now(),
    })

    return {
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        avatar_id: user.avatar_id || 25,
        must_change_password: false,
      },
    }
  },
})

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique()
    if (!session) return null

    const user = await ctx.db.get(session.userId)
    if (!user) return null

    return {
      id: user._id,
      username: user.username,
      role: user.role,
      avatar_id: user.avatar_id || 25,
      must_change_password: false,
    }
  },
})

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique()
    if (session) await ctx.db.delete(session._id)
    return { ok: true }
  },
})
