// The placement test: 12 spoken items in 3 short parts (about 2 minutes each), easy to harder.
// "Listen" items are questions at normal speed to answer; "Say" items are English sentences to
// say in Spanish. Each part is graded in the background (one small AI call) while the next part
// goes on. Answers and graded parts are saved on the phone: a failed check is retried on its own,
// and you can stop after any part and come back later. The level is computed on the phone.
import { createStore } from './store'
import { cards, profile, saveCards, setProfile } from './data'
import { call } from './ai'
import { PLACEMENT } from './prompts'
import { listen, MicError, speakOne, stopSpeaking, unlockSpeech, loadVoices, type Listening } from './speech'
import { sayOpts } from './voice'
import { newCard } from './srs'
import { MISTAKE_TYPES, type MistakeType, type Placement, type PlacementDraft, type PlacementItemGrade } from './model'
import { levelLabel } from './plan'
import { norm } from './grade'

export interface PItem { id: string; kind: 'listen' | 'say'; text: string; /** 1 = A1 … 3 = B1 */ level: number }

export const PARTS: { title: string; items: PItem[] }[] = [
  { title: 'Basics', items: [
    { id: 'l1', kind: 'listen', text: '¿Cómo se llama usted y de dónde es?', level: 1 },
    { id: 's1', kind: 'say', text: 'I clean the kitchen every Monday.', level: 1 },
    { id: 'l2', kind: 'listen', text: '¿Qué hace usted normalmente los domingos?', level: 1.5 },
    { id: 's2', kind: 'say', text: 'Tomorrow I’m going to swim at the beach.', level: 1.5 },
  ] },
  { title: 'Plans and the past', items: [
    { id: 'l3', kind: 'listen', text: '¿Y qué va a hacer este fin de semana?', level: 2 },
    { id: 's3', kind: 'say', text: 'Yesterday I went to the market and bought some fruit.', level: 2 },
    { id: 'l4', kind: 'listen', text: '¿Qué hizo usted ayer por la noche?', level: 2 },
    { id: 's4', kind: 'say', text: 'Please clean the bathroom and then the bedroom. (to your housekeeper, usted)', level: 2 },
  ] },
  { title: 'Real life', items: [
    { id: 'l5', kind: 'listen', text: 'Perdone, ¿me podría decir dónde está la farmacia más cercana?', level: 2.5 },
    { id: 's5', kind: 'say', text: 'I’m sorry, I can’t come on Saturday because I have to work.', level: 2.5 },
    { id: 'l6', kind: 'listen', text: 'Cuénteme un poco de su familia. ¿Tiene hermanos?', level: 2.5 },
    { id: 'l7', kind: 'listen', text: 'Si usted tuviera un mes de vacaciones, ¿adónde iría y por qué?', level: 3 },
  ] },
]
export const ITEMS = PARTS.flatMap((p) => p.items)
export const partOf = (index: number) => Math.floor(index / 4)
/** The Spanish text appears as a hint from the 3rd time a question is played. */
export const HINT_AFTER = 3

export type PartState = 'waiting' | 'checking' | 'done' | 'error'
export interface PState {
  /** intro → items → break (after a part) → … → result */
  phase: 'intro' | 'items' | 'break' | 'result'
  index: number
  status: 'idle' | 'speaking' | 'waiting' | 'listening'
  interim: string
  plays: number
  error?: string
  micDenied?: boolean
  parts: PartState[]
  partErrors: (string | undefined)[]
  result?: Placement
}
export const ptest = createStore<PState | null>(null)
const patch = (p: Partial<PState>) => { const s = ptest.get(); if (s) ptest.set({ ...s, ...p }) }

let mic: Listening | null = null
let gen = 0

const draft = (): PlacementDraft | undefined => profile.get().placementDraft
const saveDraft = (d: PlacementDraft | undefined) => setProfile({ placementDraft: d })
const answered = (d: PlacementDraft | undefined, id: string) => !!d && id in d.answers

/** Opens the test screen: a fresh start, or where you stopped last time. */
export function openTest() {
  stopAll()
  const d = draft()
  const parts: PartState[] = PARTS.map((_, i) => (d?.graded[i] ? 'done' : 'waiting'))
  ptest.set({ phase: 'intro', index: firstUnanswered(d), status: 'idle', interim: '', plays: 0, parts, partErrors: [] })
  // Parts answered but never checked (the app was closed): check them now.
  if (d) PARTS.forEach((p, i) => { if (!d.graded[i] && p.items.every((it) => answered(d, it.id))) void gradePart(i) })
}
const firstUnanswered = (d?: PlacementDraft) => { const i = ITEMS.findIndex((it) => !answered(d, it.id)); return i < 0 ? ITEMS.length : i }
export const inProgress = () => !!draft() && Object.keys(draft()!.answers).length > 0

export function stopAll() { gen++; mic?.cancel(); mic = null; stopSpeaking() }

/** Start (or continue) answering. */
export function begin(restart = false) {
  unlockSpeech()
  void loadVoices()
  if (restart || !draft()) { saveDraft({ startedAt: Date.now(), answers: {}, graded: {} }); patch({ parts: PARTS.map(() => 'waiting'), partErrors: [] }) }
  const index = firstUnanswered(draft())
  if (index >= ITEMS.length) {
    // Everything answered already: only the checks are left.
    patch({ phase: 'break', index })
    PARTS.forEach((_, i) => { if (!draft()!.graded[i]) void gradePart(i) })
    finishIfReady()
    return
  }
  patch({ phase: 'items', index, plays: 0, error: undefined })
  void present()
}

/** Speaks the current item (each play counts toward the hint). */
export async function present() {
  const s = ptest.get()
  if (!s || s.phase !== 'items') return
  const it = ITEMS[s.index]
  const g = ++gen
  mic?.cancel(); mic = null
  stopSpeaking()
  const plays = s.plays + 1
  patch({ status: 'speaking', interim: '', plays })
  // Listening items at normal speed (that is what is tested), a little slower from the 3rd play.
  const opts = it.kind === 'listen' ? { ...sayOpts(1, 'es'), rate: plays >= HINT_AFTER ? 0.85 : 1 } : sayOpts(1, 'en')
  await speakOne(it.text, opts)
  if (g === gen && ptest.get()?.status === 'speaking') patch({ status: 'waiting' })
}

export function micTap() {
  const s = ptest.get()
  if (!s || s.phase !== 'items') return
  if (mic) { mic.stop(); return }
  stopSpeaking()
  gen++
  patch({ status: 'listening', interim: '', error: undefined })
  const m = listen({ lang: 'es-MX', untilStopped: true, onInterim: (t) => patch({ interim: t }) })
  mic = m
  m.result.then((text) => {
    if (mic === m) mic = null
    if (text) answer(text); else patch({ status: 'waiting' })
  }, (e) => {
    if (mic === m) mic = null
    patch({ status: 'waiting', error: e instanceof MicError ? e.message : 'Microphone problem.', micDenied: e instanceof MicError && e.code === 'denied' })
  })
}

/** Records the answer (spoken, typed, or "" to skip), saves it, and moves on. */
export function answer(heard: string) {
  const s = ptest.get()
  const d = draft()
  if (!s || s.phase !== 'items' || !d) return
  mic?.cancel(); mic = null
  stopSpeaking()
  const it = ITEMS[s.index]
  saveDraft({ ...d, answers: { ...d.answers, [it.id]: { heard, plays: s.plays } } })
  const part = partOf(s.index)
  const next = s.index + 1
  if (next >= ITEMS.length || partOf(next) !== part) {
    void gradePart(part)
    patch({ phase: 'break', index: next, status: 'idle', interim: '', plays: 0 })
    return
  }
  patch({ index: next, interim: '', plays: 0 })
  void present()
}

/** Grades one part (4 answers) in the background. Safe to call again after a failure. */
export async function gradePart(part: number) {
  const s0 = ptest.get()
  if (!s0 || s0.parts[part] === 'checking' || s0.parts[part] === 'done') return
  const setPart = (st: PartState, err?: string) => {
    const s = ptest.get()
    if (!s) return
    const parts = [...s.parts]; parts[part] = st
    const partErrors = [...s.partErrors]; partErrors[part] = err
    patch({ parts, partErrors })
  }
  setPart('checking')
  const d = draft()!
  const lines = PARTS[part].items.map((it) => {
    const a = d.answers[it.id]
    const q = it.kind === 'listen' ? `listen — heard the question "${it.text}" at normal speed${a?.plays > 1 ? `, played ${a.plays}×` : ''}` : `say — asked to say in Spanish: "${it.text}"`
    return `- id "${it.id}" (${q})\n  answer: "${a?.heard ?? ''}"`
  }).join('\n')
  try {
    const res = await call({ system: [PLACEMENT], messages: [{ role: 'user', content: `Part ${part + 1} of 3 ("${PARTS[part].title}"):\n${lines}` }], maxTokens: 1500, kind: 'placement', effort: 'medium', json: true })
    const r = parsePart(res.text, PARTS[part].items.map((i) => i.id))
    if (!r) throw new Error('The answer from the AI could not be read.')
    const cur = draft()
    if (!cur) return
    saveDraft({ ...cur, graded: { ...cur.graded, [part]: { items: r.items, note: r.note } } })
    const have = new Set(Object.values(cards.get()).map((c) => norm(c.answer)))
    saveCards(r.cards.filter((c) => !have.has(norm(c.answer))).map((c) => newCard({ ...c, source: 'placement' }, Date.now(), true)))
    setPart('done')
    finishIfReady()
  } catch (e) {
    setPart('error', e instanceof Error ? e.message : 'The check failed.')
  }
}

/** All three parts checked (and you're not mid-part): compute the level and show it. */
export function finishIfReady() {
  const s = ptest.get()
  const d = draft()
  if (!s || !d || s.phase === 'items' || s.phase === 'result') return
  if (!PARTS.every((_, i) => d.graded[i])) return
  const r = levelFrom(d)
  const p: Placement = { at: Date.now(), level: r.level, label: levelLabel(r.level), summary: r.summary, weak: r.weak, scores: r.scores }
  setProfile({ level: r.level, placements: [...profile.get().placements, p], placementDraft: undefined })
  patch({ phase: 'result', result: p })
}

/** The level, from the graded answers: the hardest band you handle well, item by item. */
export function levelFrom(d: Pick<PlacementDraft, 'graded'>): { level: number; scores: Record<MistakeType, number>; weak: MistakeType[]; summary: string } {
  const grades = new Map<string, PlacementItemGrade>()
  for (const g of Object.values(d.graded)) for (const it of g.items) grades.set(it.id, it)
  const bands = [...new Set(ITEMS.map((i) => i.level))].sort((a, b) => a - b)
  let level = 1
  for (const b of bands) {
    const items = ITEMS.filter((i) => i.level === b)
    const avg = items.reduce((a, i) => a + (grades.get(i.id)?.score ?? 0), 0) / items.length
    if (avg >= 0.7) { level = b; continue }
    if (avg >= 0.45) level = Math.max(level, b - 0.25)
    break
  }
  const scores = Object.fromEntries(MISTAKE_TYPES.map((t) => {
    const n = [...grades.values()].filter((g) => g.issues.includes(t)).length
    return [t, Math.max(0, Math.round((1 - n * 0.2) * 100) / 100)]
  })) as Record<MistakeType, number>
  const weak = [...MISTAKE_TYPES].filter((t) => scores[t] < 0.85).sort((a, b) => scores[a] - scores[b]).slice(0, 3)
  const summary = Object.keys(d.graded).sort().map((k) => d.graded[Number(k)].note).filter(Boolean).join(' ')
  return { level, scores, weak, summary }
}

const isType = (t: unknown): t is MistakeType => (MISTAKE_TYPES as string[]).includes(String(t))

export function parsePart(text: string, ids: string[]) {
  let j: Record<string, unknown>
  try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { return null }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const list = (Array.isArray(j.items) ? j.items : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
  const items: PlacementItemGrade[] = ids.map((id) => {
    const x = list.find((y) => str(y.id) === id)
    const score = typeof x?.score === 'number' ? Math.max(0, Math.min(1, x.score)) : 0
    return { id, score, issues: (Array.isArray(x?.issues) ? x!.issues : []).filter(isType) as MistakeType[], fix: str(x?.fix).slice(0, 200) }
  })
  if (!list.length) return null
  const cs = (Array.isArray(j.cards) ? j.cards : []).filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ cue: str(c.cue), answer: str(c.answer), alts: (Array.isArray(c.alts) ? c.alts : []).map(str).filter(Boolean).slice(0, 2), type: isType(c.t) ? c.t : 'vocab' as MistakeType }))
    .filter((c) => c.cue && c.answer).slice(0, 2)
  return { items, note: str(j.note).slice(0, 240), cards: cs }
}

/** Continue to the next part (from the break screen). */
export function nextPart() { const s = ptest.get(); if (!s) return; patch({ phase: 'items', plays: 0 }); void present() }
