// Today's scenario, weakest areas, level, streak and the Stage 2 unlock. Plain code, no AI.
import { MISTAKE_TYPES, type Mistake, type MistakeType, type Profile, type SessionRec, type StageId } from './model'
import { stageScenarios, type Scenario } from './curriculum'
import { DAY } from './srs'

// ---- Dates (local time)
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const monthKey = (t: number) => dayKey(t).slice(0, 7)

// ---- Level
const LABELS: [number, string][] = [[1.0, 'A1'], [1.5, 'A1+'], [2.0, 'A2'], [2.5, 'A2+'], [3.0, 'B1'], [3.5, 'B1+']]
export function levelLabel(l: number): string {
  let best = LABELS[0]
  for (const x of LABELS) if (Math.abs(x[0] - l) < Math.abs(best[0] - l)) best = x
  return best[1]
}
/** "A2-" → 1.75, "A2" → 2, "A2+" → 2.5. Unknown → null. */
export function parseLevel(s: string | undefined | null): number | null {
  const m = /([AB])\s*([12])\s*([+-]?)/i.exec(s ?? '')
  if (!m) return null
  const base = (m[1].toUpperCase() === 'A' ? 0 : 2) + Number(m[2])
  return base + (m[3] === '+' ? 0.5 : m[3] === '-' ? -0.25 : 0)
}
/** Progress from this level label to the next one (0..1). */
export function levelProgress(l: number): { label: string; next: string; pct: number } {
  const lo = Math.floor(l * 2) / 2, hi = lo + 0.5
  return { label: levelLabel(lo), next: levelLabel(hi), pct: Math.max(0, Math.min(1, (l - lo) / 0.5)) }
}
/** A session nudges the level a little (placement tests set it). */
export const blendLevel = (cur: number, session: number) => Math.round((cur * 0.85 + session * 0.15) * 100) / 100

// ---- Weak spots: recent mistakes count more, big ones double. Before there is enough data,
// the placement test's findings (verb forms, listening, French words) lead.
export const PRIOR: Record<MistakeType, number> = { verb: 3, listening: 2.2, french: 2, vocab: 1, gender: 0.6 }

export function weakness(ms: Mistake[], ss: SessionRec[], now: number, prior: Partial<Record<MistakeType, number>> = PRIOR): Record<MistakeType, number> {
  const w = Object.fromEntries(MISTAKE_TYPES.map((t) => [t, 0])) as Record<MistakeType, number>
  for (const m of ms) {
    const age = (now - m.at) / DAY
    if (age > 30) continue
    w[m.type] += (m.big ? 2 : 1) * Math.exp(-age / 10)
  }
  // Asking to repeat or slow down is a listening signal.
  for (const s of ss) { const age = (now - s.at) / DAY; if (age <= 30) w.listening += 0.5 * s.asks * Math.exp(-age / 10) }
  const n = ss.filter((s) => s.completed).length
  const k = 1 / (1 + n / 4)
  for (const t of MISTAKE_TYPES) w[t] += (prior[t] ?? 0) * k
  return w
}
/** The latest placement test sets the starting weights (low score = weak). */
export function priorFrom(p: Pick<Profile, 'placements'>): Record<MistakeType, number> {
  const last = p.placements[p.placements.length - 1]
  if (!last?.scores) return PRIOR
  const out = { ...PRIOR }
  for (const t of MISTAKE_TYPES) { const sc = last.scores[t]; if (sc != null) out[t] = (1 - sc) * 4 + (last.weak.includes(t) ? 1 : 0) }
  return out
}
export const rankWeak = (w: Record<MistakeType, number>) => [...MISTAKE_TYPES].sort((a, b) => w[b] - w[a])

// ---- Today's scenario: aims at the two weakest areas, and at what hasn't been practised lately.
export function pickScenario(stage: StageId, weak: MistakeType[], last: Record<string, number>, now: number, exclude?: string): Scenario {
  const top = weak.slice(0, 2)
  const list = stageScenarios(stage).filter((s) => s.id !== exclude)
  let best = list[0], bestScore = -Infinity
  for (const s of list) {
    const overlap = s.focus.reduce((a, f) => a + (f === top[0] ? 2 : f === top[1] ? 1 : 0), 0)
    const since = last[s.id] == null ? 20 : Math.min(14, (now - last[s.id]) / DAY)
    const score = overlap * 1.5 + since * 0.5
    if (score > bestScore) { best = s; bestScore = score }
  }
  return best
}

export function lastPracticed(ss: SessionRec[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of ss) if (s.completed && (out[s.scenario] ?? 0) < s.at) out[s.scenario] = s.at
  return out
}

/** Today's scenario: the one already picked today, or a new pick. */
export function todayScenario(p: Profile, ms: Mistake[], ss: SessionRec[], now: number): { id: string; fresh: boolean } {
  const date = dayKey(now)
  if (p.today && p.today.date === date && p.today.stage === p.stage) return { id: p.today.scenario, fresh: false }
  const s = pickScenario(p.stage, rankWeak(weakness(ms, ss, now, priorFrom(p))), lastPracticed(ss), now)
  return { id: s.id, fresh: true }
}

// ---- Streak: days in a row with a finished session (today counts once done; yesterday keeps it alive).
export function streak(ss: SessionRec[], now: number): number {
  const days = new Set(ss.filter((s) => s.completed).map((s) => dayKey(s.at)))
  let d = now
  if (!days.has(dayKey(d))) d -= DAY
  let n = 0
  while (days.has(dayKey(d))) { n++; d -= DAY }
  return n
}

// ---- Stage 2 unlock: level A2, 8 finished Stage 1 sessions, and few big mistakes lately.
export const UNLOCK = { level: 2.0, sessions: 8, bigPerTurn: 0.35 }
export function readyForStage2(level: number, ss: SessionRec[]): boolean {
  const s1 = ss.filter((s) => s.stage === 1 && s.completed).sort((a, b) => a.at - b.at)
  if (level < UNLOCK.level || s1.length < UNLOCK.sessions) return false
  const last = s1.slice(-3)
  const rate = last.reduce((a, s) => a + s.big / Math.max(1, s.turns), 0) / last.length
  return rate <= UNLOCK.bigPerTurn
}
/** What's still missing, in words (Progress shows it while Stage 2 is locked). */
export function unlockMissing(level: number, ss: SessionRec[]): string[] {
  const n = ss.filter((s) => s.stage === 1 && s.completed).length
  const out: string[] = []
  if (level < UNLOCK.level) out.push(`reach A2 (now ${levelLabel(level)})`)
  if (n < UNLOCK.sessions) out.push(`${UNLOCK.sessions - n} more Stage 1 session${UNLOCK.sessions - n === 1 ? '' : 's'}`)
  if (!out.length) out.push('fewer big mistakes in your last 3 sessions')
  return out
}
