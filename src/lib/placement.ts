// The 5-minute placement test: 12 spoken items, easy to harder. "Listen" items are questions
// at normal speed to answer; "Say" items are English sentences to say in Spanish. One AI call
// grades everything at the end and sets the level.
import { createStore } from './store'
import { cards, profile, saveCards, setProfile } from './data'
import { call, AiError } from './claude'
import { PLACEMENT } from './prompts'
import { listen, MicError, speakOne, stopSpeaking, unlockSpeech, loadVoices, type Listening } from './speech'
import { sayOpts } from './voice'
import { newCard } from './srs'
import { MISTAKE_TYPES, type MistakeType, type Placement } from './model'
import { parseLevel, levelLabel } from './plan'
import { norm } from './grade'

export interface PItem { id: string; kind: 'listen' | 'say'; text: string }

export const ITEMS: PItem[] = [
  { id: 'l1', kind: 'listen', text: '¿Cómo se llama usted y de dónde es?' },
  { id: 's1', kind: 'say', text: 'I clean the kitchen every Monday.' },
  { id: 'l2', kind: 'listen', text: '¿Qué hace usted normalmente los domingos?' },
  { id: 's2', kind: 'say', text: 'Tomorrow I’m going to swim at the beach.' },
  { id: 'l3', kind: 'listen', text: '¿Y qué va a hacer este fin de semana?' },
  { id: 's3', kind: 'say', text: 'Yesterday I went to the market and bought some fruit.' },
  { id: 'l4', kind: 'listen', text: '¿Qué hizo usted ayer por la noche?' },
  { id: 's4', kind: 'say', text: 'Please clean the bathroom and then the bedroom. (to your housekeeper, usted)' },
  { id: 'l5', kind: 'listen', text: 'Perdone, ¿me podría decir dónde está la farmacia más cercana?' },
  { id: 's5', kind: 'say', text: 'I’m sorry, I can’t come on Saturday because I have to work.' },
  { id: 'l6', kind: 'listen', text: 'Cuénteme un poco de su familia. ¿Tiene hermanos?' },
  { id: 'l7', kind: 'listen', text: 'Si usted tuviera un mes de vacaciones, ¿adónde iría y por qué?' },
]
export const TEST_MS = 5 * 60000

export interface PState {
  phase: 'intro' | 'items' | 'grading' | 'result'
  index: number
  answers: Record<string, { heard: string; replays: number }>
  status: 'idle' | 'speaking' | 'waiting' | 'listening'
  interim: string
  startedAt: number
  error?: string
  micDenied?: boolean
  result?: Placement
}
export const ptest = createStore<PState | null>(null)
const patch = (p: Partial<PState>) => { const s = ptest.get(); if (s) ptest.set({ ...s, ...p }) }

let mic: Listening | null = null
let gen = 0

export function openTest() { stopAll(); ptest.set({ phase: 'intro', index: 0, answers: {}, status: 'idle', interim: '', startedAt: 0 }) }
export function stopAll() { gen++; mic?.cancel(); mic = null; stopSpeaking() }

export function begin() {
  unlockSpeech()
  void loadVoices()
  patch({ phase: 'items', index: 0, answers: {}, startedAt: Date.now() })
  void present()
}

/** Speaks the current item. */
export async function present() {
  const s = ptest.get()
  if (!s || s.phase !== 'items') return
  const it = ITEMS[s.index]
  const g = ++gen
  stopSpeaking()
  patch({ status: 'speaking', interim: '' })
  // Listening items at normal speed: that is what is being tested.
  await speakOne(it.text, it.kind === 'listen' ? { ...sayOpts(1, 'es'), rate: 1 } : sayOpts(1, 'en'))
  if (g === gen && ptest.get()?.status === 'speaking') patch({ status: 'waiting' })
}

export function replayItem() {
  const s = ptest.get()
  if (!s || s.phase !== 'items') return
  const it = ITEMS[s.index]
  const a = s.answers[it.id] ?? { heard: '', replays: 0 }
  patch({ answers: { ...s.answers, [it.id]: { ...a, replays: a.replays + 1 } } })
  mic?.cancel(); mic = null
  void present()
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

/** Records the answer (spoken, typed, or "" for skip) and moves on. */
export function answer(heard: string) {
  const s = ptest.get()
  if (!s || s.phase !== 'items') return
  mic?.cancel(); mic = null
  const it = ITEMS[s.index]
  const a = s.answers[it.id] ?? { heard: '', replays: 0 }
  const answers = { ...s.answers, [it.id]: { ...a, heard } }
  const last = s.index >= ITEMS.length - 1 || Date.now() - s.startedAt > TEST_MS + 60000
  if (last) { patch({ answers }); void gradeTest(); return }
  patch({ answers, index: s.index + 1, interim: '' })
  void present()
}

const isType = (t: unknown): t is MistakeType => (MISTAKE_TYPES as string[]).includes(String(t))

export async function gradeTest() {
  const s = ptest.get()
  if (!s) return
  stopAll()
  patch({ phase: 'grading', status: 'idle', error: undefined })
  const lines = ITEMS.map((it, i) => {
    const a = s.answers[it.id]
    return `${i + 1}. ${it.kind === 'listen' ? `Heard the question (normal speed${a?.replays ? `, replayed ${a.replays}×` : ''}): "${it.text}"` : `Asked to say in Spanish: "${it.text}"`}\n   Answer: "${a?.heard ?? ''}"`
  }).join('\n')
  try {
    const res = await call({ system: [PLACEMENT], messages: [{ role: 'user', content: `The test answers:\n${lines}` }], maxTokens: 3000, kind: 'placement', effort: 'medium' })
    const r = parsePlacement(res.text)
    if (!r) throw new AiError('other', 'Could not read the result. Try again.')
    const now = Date.now()
    const p: Placement = { at: now, level: r.level, label: levelLabel(r.level), summary: r.summary, weak: r.weak, scores: r.scores }
    setProfile({ level: r.level, placements: [...profile.get().placements, p] })
    const have = new Set(Object.values(cards.get()).map((c) => norm(c.answer)))
    saveCards(r.cards.filter((c) => !have.has(norm(c.answer))).map((c) => newCard({ ...c, source: 'placement' }, now, true)))
    patch({ phase: 'result', result: p })
  } catch (e) {
    patch({ phase: 'grading', error: e instanceof Error ? e.message : 'Grading failed.' })
  }
}

export function parsePlacement(text: string) {
  const m = /<result>([\s\S]*?)(?:<\/result>|$)/.exec(text)
  const raw = m ? m[1] : text
  let j: Record<string, unknown>
  try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch { return null }
  const level = parseLevel(typeof j.level === 'string' ? j.level : '')
  if (level == null) return null
  const scores: Partial<Record<MistakeType, number>> = {}
  if (j.scores && typeof j.scores === 'object') for (const [k, v] of Object.entries(j.scores as Record<string, unknown>)) if (isType(k) && typeof v === 'number') scores[k] = Math.max(0, Math.min(1, v))
  const weak = (Array.isArray(j.weak) ? j.weak : []).filter(isType).slice(0, 3) as MistakeType[]
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const cs = (Array.isArray(j.cards) ? j.cards : []).filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ cue: str(c.cue), answer: str(c.answer), alts: (Array.isArray(c.alts) ? c.alts : []).map(str).filter(Boolean).slice(0, 2), type: isType(c.t) ? c.t : 'vocab' as MistakeType }))
    .filter((c) => c.cue && c.answer).slice(0, 5)
  return { level, summary: str(j.summary).slice(0, 400), scores, weak, cards: cs }
}

