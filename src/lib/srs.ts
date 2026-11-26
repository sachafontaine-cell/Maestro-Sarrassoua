// Spaced review: new items come back after 1 day, then 3 days, 1 week, 2 weeks, 1 month.
// A miss starts the item over at 1 day. After the 1-month review it is "remembered" and comes
// back every 2 months to keep it fresh.
import type { Card, MistakeType } from './model'
import { uid } from './store'

export const DAY = 86400000
/** Days until the next review after the n-th success in a row (n = 1..5). */
export const AFTER_SUCCESS = [3, 7, 14, 30, 60]
export const LEARNED_STEP = 2 // remembered at the 3-day review: counts as a word learned

export function newCard(p: { cue: string; answer: string; alts?: string[]; type: MistakeType; source: Card['source'] }, now: number, dueNow = false): Card {
  return { id: uid(), cue: p.cue, answer: p.answer, alts: p.alts ?? [], type: p.type, source: p.source, created: now, due: dueNow ? now : now + DAY, step: 0, reps: 0, lapses: 0 }
}

export function review(c: Card, ok: boolean, heard: string, now: number): Card {
  if (ok) {
    const step = Math.min(5, c.step + 1)
    return { ...c, step, reps: c.reps + 1, due: now + AFTER_SUCCESS[step - 1] * DAY, last: { at: now, ok, heard } }
  }
  return { ...c, step: 0, reps: c.reps + 1, lapses: c.lapses + 1, due: now + DAY, last: { at: now, ok, heard } }
}

/** Due items, most overdue and most-missed first. Same-answer duplicates are skipped. */
export function dueCards(all: Card[], now: number, max = 8): Card[] {
  const seen = new Set<string>()
  return all
    .filter((c) => c.due <= now)
    .sort((a, b) => b.lapses - a.lapses || a.due - b.due)
    .filter((c) => { const k = c.answer.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, max)
}

/** The interval label for a card, e.g. "in 3 days". */
export function nextLabel(c: Card, now: number): string {
  const d = Math.round((c.due - now) / DAY)
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : d < 14 ? `in ${d} days` : d < 45 ? `in ${Math.round(d / 7)} weeks` : `in ${Math.round(d / 30)} months`
}

/** Starter items from the placement test's weak spots, so the very first session has a review. */
export const SEEDS: { cue: string; answer: string; alts?: string[]; type: MistakeType }[] = [
  { cue: 'I’m going to clean the kitchen.', answer: 'Voy a limpiar la cocina.', type: 'verb' },
  { cue: 'What are you going to do tomorrow? (usted)', answer: '¿Qué va a hacer mañana?', type: 'listening' },
  { cue: 'Yesterday I went to the market.', answer: 'Ayer fui al mercado.', type: 'verb' },
  { cue: 'to swim', answer: 'nadar', type: 'french' },
  { cue: 'over there', answer: 'allá', alts: ['ahí', 'allí'], type: 'french' },
  { cue: 'Please clean the bathroom. (usted)', answer: 'Limpie el baño, por favor.', alts: ['Por favor, limpie el baño.'], type: 'verb' },
  { cue: 'We eat at eight.', answer: 'Comemos a las ocho.', type: 'verb' },
  { cue: 'What did you do yesterday? (usted)', answer: '¿Qué hizo ayer?', alts: ['¿Qué hizo usted ayer?'], type: 'listening' },
]
