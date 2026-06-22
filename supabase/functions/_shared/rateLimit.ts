// _shared/rateLimit.ts
// Sliding-window rate limiter using Upstash Redis
// Falls back to no-op if UPSTASH_REDIS_REST_URL is not set (dev mode)

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number   // Unix epoch seconds
}

export async function checkRateLimit(
  userId: string,
  action: string,
  limitPerMinute = 10,
): Promise<RateLimitResult> {
  const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL')
  const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

  // Dev fallback: allow all
  if (!redisUrl || !redisToken) {
    return { allowed: true, remaining: limitPerMinute - 1, resetAt: 0 }
  }

  const windowSeconds = 60
  const key = `rl:${action}:${userId}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - windowSeconds

  // Upstash REST pipeline: ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE
  const pipeline = [
    ['ZREMRANGEBYSCORE', key, '-inf', windowStart],
    ['ZADD', key, now, `${now}-${crypto.randomUUID()}`],
    ['ZCARD', key],
    ['EXPIRE', key, windowSeconds],
  ]

  const res = await fetch(`${redisUrl}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pipeline),
  })

  const results = await res.json() as Array<{ result: number }>
  const count = results[2]?.result ?? 0
  const allowed = count <= limitPerMinute

  return {
    allowed,
    remaining: Math.max(0, limitPerMinute - count),
    resetAt: now + windowSeconds,
  }
}
