// What each call costs, from the token counts the API returns. Prices in US$ per million tokens.
import type { Usage } from './model'
import { monthKey } from './plan'

export const MODEL = 'claude-sonnet-5-5'

interface Price { input: number; write: number; read: number; output: number }
const PRICES: [RegExp, Price][] = [
  [/sonnet-5-5/, { input: 2, write: 2.5, read: 0.1, output: 10 }],
  [/sonnet-5/, { input: 2, write: 2.5, read: 0.2, output: 10 }],
  [/opus-5-5/, { input: 4, write: 5, read: 0.2, output: 20 }],
  [/opus/, { input: 5, write: 6.25, read: 0.5, output: 25 }],
  [/haiku-5-5/, { input: 0.1, write: 0.125, read: 0.01, output: 0.5 }],
  [/sonnet/, { input: 3, write: 3.75, read: 0.3, output: 15 }],
]
export const priceOf = (model: string): Price => PRICES.find(([r]) => r.test(model))?.[1] ?? PRICES[0][1]

export function usd(model: string, t: { input: number; cacheWrite: number; cacheRead: number; output: number }): number {
  const p = priceOf(model)
  return (t.input * p.input + t.cacheWrite * p.write + t.cacheRead * p.read + t.output * p.output) / 1e6
}

export function totals(all: Usage[], now: number) {
  const month = monthKey(now)
  const bySession = new Map<string, number>()
  let thisMonth = 0, allTime = 0
  for (const u of all) {
    allTime += u.usd
    if (monthKey(u.at) === month) thisMonth += u.usd
    if (u.session) bySession.set(u.session, (bySession.get(u.session) ?? 0) + u.usd)
  }
  const per = [...bySession.values()]
  return { thisMonth, allTime, perSession: (id: string) => bySession.get(id) ?? 0, avgSession: per.length ? per.reduce((a, b) => a + b, 0) / per.length : 0 }
}

export const money = (v: number) => v === 0 ? '$0.00' : v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`
