// A practice session: 1. spaced review (about 2 min), 2. role-play with the tutor (12–15 min),
// 3. recap (top 3 fixes, written and read aloud, added to the review list).
// Tap-to-talk by default; hands-free listens by itself after the tutor speaks.
import { createStore, uid } from './store'
import { addMistakes, cards, mistakes, profile, saveCards, saveSession, sessions, setProfile, settings } from './data'
import { scenario as getScenario } from './curriculum'
import type { Card, Fix, Mistake, MistakeType, SessionRec, StageId, Word } from './model'
import { MISTAKE_TYPES } from './model'
import { blendLevel, dayKey, parseLevel, priorFrom, rankWeak, readyForStage2, weakness } from './plan'
import { dueCards, newCard, review as reviewCard, DAY } from './srs'
import { grade, norm, wordCount, type Grade } from './grade'
import { command, RATE_STEP, type Command } from './commands'
import { ReplyParser, type NoteMistake, type Seg } from './reply'
import { AiError, call, type Msg } from './claude'
import { ENGLISH, HANDS_FREE_OFF, HANDS_FREE_ON, RECAP, RECAP_USER, sessionBlock, START, TUTOR, WRAP_UP } from './prompts'
import { listen, loadVoices, MicError, SpeakQueue, stopSpeaking, unlockSpeech, type Listening } from './speech'
import { nudgeRate, sayOpts, stageLang } from './voice'
import { keepAwake } from './wakelock'

export const REVIEW_MS = 2 * 60000
export const WRAP_MS = 12 * 60000
export const END_MS = 15.5 * 60000

export type Phase = 'review' | 'talk' | 'recap' | 'done'
export type Status = 'idle' | 'waiting' | 'listening' | 'thinking' | 'speaking' | 'paused'

export interface Correction extends NoteMistake { revealed: boolean }
export interface Bubble { id: string; who: 'tutor' | 'me'; text: string; segs?: Seg[]; corrections?: Correction[]; streaming?: boolean }
export interface ReviewItem { card: Card; heard?: string; grade?: Grade }
export interface Recap { fixes: Fix[]; words: Word[]; noteEn: string; noteEs: string; level?: string; added: number; spoke: number; minutes: number; reviewed: number; reviewOk: number }

export interface Live {
  id: string
  stage: StageId
  scenario: string
  handsFree: boolean
  phase: Phase
  status: Status
  startedAt: number
  talkAt?: number
  review: { items: ReviewItem[]; index: number; shown?: Grade }
  bubbles: Bubble[]
  interim: string
  error?: { msg: string; mic?: boolean; retry?: boolean }
  mistakes: Mistake[]
  words: Word[]
  asks: number
  turns: number
  myWords: number
  tutorWords: number
  struggle: boolean
  recap?: Recap
}

export const live = createStore<Live | null>(null)
const patch = (p: Partial<Live> | ((l: Live) => Partial<Live>)) => {
  const l = live.get()
  if (l) live.set({ ...l, ...(typeof p === 'function' ? p(l) : p) })
}

// ---------------- Session-wide state that the screen doesn't draw
let history: Msg[] = []
let system: string[] = []
let ctrl: AbortController | null = null
let gen = 0 // bumps when a session ends: anything still running from it stops
let lastSay: Seg[] = []
let wrapSent = false
let paused: { resume: () => void; promise: Promise<void> } | null = null

// Input: the screen (mic button, typing) or the microphone in hands-free mode.
let waiter: ((v: string | typeof RETRY) => void) | null = null
let mic: Listening | null = null
/** A command from a button (Repeat), handled like the spoken one. */
let injected: string | null = null
/** Hands-free switched on or off mid-conversation: tell the tutor with the next turn. */
let modeNote: string | null = null
const RETRY = Symbol('retry')
class Stop extends Error {}

const alive = (g: number) => { if (g !== gen) throw new Stop() }

// ---------------- Starting and ending

export interface StartOpts { handsFree: boolean; scenario: string }

export function startSession(o: StartOpts) {
  // Inside the tap: Chrome only lets the page speak after one.
  unlockSpeech()
  void loadVoices()
  endQuietly()
  const g = ++gen
  const p = profile.get()
  const now = Date.now()
  const items = dueCards(Object.values(cards.get()), now).map((card) => ({ card }))
  history = []
  lastSay = []
  wrapSent = false
  modeNote = null
  paused = null
  live.set({
    id: uid(), stage: p.stage, scenario: o.scenario, handsFree: o.handsFree, phase: items.length ? 'review' : 'talk', status: 'idle',
    startedAt: now, review: { items, index: 0 }, bubbles: [], interim: '', mistakes: [], words: [], asks: 0, turns: 0, myWords: 0, tutorWords: 0, struggle: false,
  })
  if (!profile.get().today || profile.get().today!.date !== dayKey(now) || profile.get().today!.scenario !== o.scenario) {
    setProfile({ today: { date: dayKey(now), stage: p.stage, scenario: o.scenario } })
  }
  void keepAwake(true)
  void run(g)
}

async function run(g: number) {
  try {
    const l = live.get()!
    if (l.phase === 'review') await reviewLoop(g)
    alive(g)
    if (live.get()!.phase === 'talk') await talkLoop(g)
    alive(g)
    if (live.get()!.phase === 'recap') await recapPhase(g)
  } catch (e) {
    if (e instanceof Stop) return
    patch({ error: { msg: e instanceof Error ? e.message : 'Something went wrong.' }, status: 'idle' })
  }
}

/** Leaves the session screen: stops everything; what was done is kept. */
export function endQuietly() {
  gen++
  ctrl?.abort()
  ctrl = null
  stopSpeaking()
  mic?.cancel()
  mic = null
  waiter = null
  paused = null
  injected = null
  const l = live.get()
  if (l && l.phase !== 'done' && (l.turns > 0 || l.review.index > 0)) saveRecord(l, false)
  live.set(null)
  void keepAwake(false)
}

/** "terminar", or ✕ → End: go to the recap now. */
export function finishNow() {
  const l = live.get()
  if (!l || l.phase === 'recap' || l.phase === 'done') return
  const g = ++gen // stops the running loop
  ctrl?.abort()
  stopSpeaking()
  mic?.cancel()
  mic = null
  waiter = null
  paused = null
  patch({ phase: 'recap', status: 'thinking', interim: '' })
  void recapPhase(g).catch((e) => { if (!(e instanceof Stop)) patch({ error: { msg: e instanceof Error ? e.message : 'Recap failed.' }, status: 'idle' }) })
}

// ---------------- Speaking

function speak(segs: Seg[], g: number, mult = 1): Promise<void> {
  alive(g)
  const l = live.get()!
  patch({ status: 'speaking' })
  const q = new SpeakQueue((lang) => sayOpts(l.stage, lang, mult))
  for (const s of segs) q.push(s.text, s.lang)
  return q.drain().then(() => alive(g))
}
const es = (text: string): Seg => ({ text, lang: 'es' })
const en = (text: string): Seg => ({ text, lang: 'en' })

// ---------------- Listening / input

/** Waits for what the learner says (or types). Commands are returned as typed. */
async function hear(g: number): Promise<string> {
  let silent = 0
  for (;;) {
    alive(g)
    await waitIfPaused(g)
    if (injected) { const t = injected; injected = null; return t }
    const l = live.get()!
    if (l.handsFree) {
      patch({ status: 'listening', interim: '' })
      const lang = stageLang(l.stage)
      mic = listen({ lang, untilStopped: false, onInterim: (t) => patch({ interim: t }) })
      let text: string
      try { text = await mic.result } catch (e) { mic = null; await micFailed(e, g); continue } finally { mic = null }
      alive(g)
      if (injected || live.get()!.status === 'paused' || !live.get()!.handsFree) continue
      patch({ interim: '' })
      if (text) return text
      silent++
      // Driving: take your time. A nudge after a while, a pause only after a long silence.
      if (silent === 2) await speak([es('¿Sigue ahí?')], g)
      if (silent === 4) await speak([en('Say “repite” to hear it again, or “terminar” to finish.')], g)
      if (silent >= 6) { await speak([es('Pausa. Toque el botón para seguir.')], g); pause(); silent = 0 }
      continue
    }
    // Tap-to-talk: wait for the mic button (or typed text). It may already be listening
    // (tapped while the tutor was still speaking).
    if (!mic) patch({ status: 'waiting', interim: '' })
    const v = await new Promise<string | typeof RETRY>((resolve) => { waiter = resolve })
    waiter = null
    alive(g)
    if (v === RETRY) continue
    if (v.trim()) return v.trim()
  }
}

async function micFailed(e: unknown, g: number) {
  alive(g)
  if (e instanceof MicError) {
    patch({ error: { msg: e.code === 'denied' ? 'MIC_DENIED' : e.message, mic: true }, status: 'paused' })
    pause(false)
    return
  }
  throw e
}

/** The mic button: start listening, or stop and send. While the tutor speaks, it interrupts. */
export function micTap() {
  const l = live.get()
  if (!l) return
  if (l.status === 'paused') { resume(); return }
  if (mic) { mic.stop(); return }
  if (l.status === 'speaking') stopSpeaking()
  if (l.handsFree) return
  unlockSpeech()
  // Starts listening; the result goes to whoever waits for input.
  const go = () => {
    patch({ status: 'listening', interim: '', error: undefined })
    const m = listen({ lang: stageLang(l.stage), untilStopped: true, onInterim: (t) => patch({ interim: t }) })
    mic = m
    m.result.then((text) => {
      if (mic === m) mic = null
      // Answered before the tutor's reply had fully arrived: keep it for the next turn.
      if (waiter) waiter(text); else if (text) { injected = text; patch({ status: 'thinking' }) } else patch({ status: 'waiting' })
    }, (e) => {
      if (mic === m) mic = null
      if (e instanceof MicError) patch({ error: { msg: e.code === 'denied' ? 'MIC_DENIED' : e.message, mic: true }, status: 'waiting' })
    })
  }
  if (waiter || l.status === 'speaking') go()
}

/** Typed instead of spoken. */
export function sendTyped(text: string) {
  const t = text.trim()
  if (!t) return
  if (waiter) { waiter(t); return }
  // Typed while the tutor is still speaking: interrupt, it's the next answer.
  const l = live.get()
  if (l && (l.status === 'speaking' || l.status === 'listening')) { injected = t; stopSpeaking(); mic?.cancel(); mic = null }
}

export function cancelListening() { mic?.cancel(); mic = null; const l = live.get(); if (l && l.status === 'listening') patch({ status: 'waiting', interim: '' }) }

export function setHandsFree(on: boolean) {
  const l = live.get()
  if (!l || l.handsFree === on) return
  mic?.cancel()
  mic = null
  patch({ handsFree: on })
  if (history.length) modeNote = on ? HANDS_FREE_ON : HANDS_FREE_OFF
  if (waiter) waiter(RETRY)
}

export function pause(stopNow = true) {
  if (stopNow) { stopSpeaking(); mic?.cancel(); mic = null }
  if (!paused) {
    let resolve!: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    paused = { resume: resolve, promise }
  }
  patch({ status: 'paused', interim: '' })
  if (waiter) waiter(RETRY)
}
export function resume() {
  const p = paused
  paused = null
  patch({ status: waiter ? 'waiting' : 'idle', error: undefined })
  p?.resume()
}
async function waitIfPaused(g: number) {
  while (paused) { await paused.promise; alive(g) }
}

/** The Repeat button: same as saying "repite". */
export function repeatLast() {
  const l = live.get()
  if (!l || (l.phase !== 'review' && l.phase !== 'talk')) return
  injected = 'repite'
  if (l.status === 'speaking') stopSpeaking()
  if (mic) { mic.cancel(); mic = null }
  if (waiter) waiter(RETRY)
}

/** Replays one tutor message (tap on a bubble), outside the conversation flow. */
export function replay(segs: Seg[]) {
  const l = live.get()
  if (!l || l.status === 'listening' || l.status === 'thinking') return
  stopSpeaking()
  const q = new SpeakQueue((lang) => sayOpts(l.stage, lang))
  segs.forEach((x) => q.push(x.text, x.lang))
}

// ---------------- 1. Spaced review

const cueText = (c: Card) => /^how\b/i.test(c.cue) ? c.cue : `How do you say: ${c.cue}`

async function reviewLoop(g: number) {
  const start = Date.now()
  for (;;) {
    alive(g)
    const l = live.get()!
    const it = l.review.items[l.review.index]
    if (!it || Date.now() - start > REVIEW_MS) break
    patch({ status: 'speaking' })
    await speak([en(cueText(it.card))], g)
    let heard = ''
    for (;;) {
      heard = await hear(g)
      const c = command(heard)
      if (c === 'repeat' || c === 'slower') { if (c === 'slower') nudgeRate(-RATE_STEP); await speak([en(cueText(it.card))], g); continue }
      if (c === 'faster') { nudgeRate(RATE_STEP); continue }
      if (c === 'end') { finishFromLoop(); return }
      break
    }
    const dont = /^(no se|no lo se|paso|skip|i don ?t know|ni idea)$/.test(norm(heard))
    const gr: Grade = dont ? 'wrong' : grade(heard, it.card.answer, it.card.alts)
    const ok = gr !== 'wrong'
    saveCards([reviewCard(it.card, ok, heard, Date.now())])
    const items = live.get()!.review.items.map((x, i) => (i === live.get()!.review.index ? { ...x, heard, grade: gr } : x))
    patch((cur) => ({ review: { ...cur.review, items, shown: gr } }))
    if (gr === 'right') await speak([es('¡Muy bien!'), es(it.card.answer)], g)
    else if (gr === 'close') await speak([es('Casi. Se dice:'), es(it.card.answer)], g)
    else await speak([es('Se dice:'), es(it.card.answer)], g)
    if (!live.get()!.handsFree) await new Promise((r) => setTimeout(r, 900))
    patch((cur) => ({ review: { ...cur.review, index: cur.review.index + 1, shown: undefined } }))
  }
  patch({ phase: 'talk' })
}

/** Skip the rest of the review (button). */
export function skipReview() {
  const l = live.get()
  if (!l || l.phase !== 'review') return
  const g = ++gen
  stopSpeaking(); mic?.cancel(); mic = null; waiter = null
  patch({ phase: 'talk', status: 'idle' })
  void (async () => { try { await talkLoop(g); alive(g); if (live.get()?.phase === 'recap') await recapPhase(g) } catch (e) { if (!(e instanceof Stop)) patch({ error: { msg: e instanceof Error ? e.message : 'Something went wrong.' }, status: 'idle' }) } })()
}

function finishFromLoop() {
  // Called from inside a loop: let finishNow take over with a fresh generation.
  queueMicrotask(finishNow)
  throw new Stop()
}

// ---------------- 2. Role-play

function recurring(all: Mistake[]): Mistake[] {
  const seen = new Map<string, { m: Mistake; n: number }>()
  for (const m of all.slice(-200)) {
    const k = norm(m.fix)
    const cur = seen.get(k)
    seen.set(k, { m, n: (cur?.n ?? 0) + 1 })
  }
  return [...seen.values()].filter((x) => x.n > 1 || x.m.big).sort((a, b) => b.n - a.n || b.m.at - a.m.at).slice(0, 8).map((x) => x.m)
}

async function talkLoop(g: number) {
  const l = live.get()!
  const now = Date.now()
  const weak = rankWeak(weakness(mistakes.get(), Object.values(sessions.get()), now, priorFrom(profile.get())))
  const words = Object.values(cards.get()).filter((c) => c.step <= 2).sort((a, b) => b.created - a.created).slice(0, 4)
  system = [TUTOR, sessionBlock({ stage: l.stage, scenarioId: l.scenario, region: settings.get().region, level: profile.get().level, weak, recurring: recurring(mistakes.get()), words, handsFree: l.handsFree, minutes: 13 })]
  patch({ talkAt: Date.now() })
  if (!history.length) await tutorTurn([{ role: 'user', content: START }], g)
  for (;;) {
    alive(g)
    const heard = await hear(g)
    const c = command(heard)
    if (c) { if (await onCommand(c, g)) return; continue }
    addMine(heard)
    const notes: Msg[] = []
    const elapsed = Date.now() - (live.get()!.talkAt ?? Date.now())
    if (modeNote) { notes.push({ role: 'system', content: modeNote }); modeNote = null }
    if (elapsed > WRAP_MS && !wrapSent) { wrapSent = true; notes.push({ role: 'system', content: WRAP_UP }) }
    const done = await tutorTurn([{ role: 'user', content: heard }, ...notes], g)
    if (done || Date.now() - (live.get()!.talkAt ?? Date.now()) > END_MS) { patch({ phase: 'recap' }); return }
  }
}

async function onCommand(c: Command, g: number): Promise<boolean> {
  if (c === 'end') { patch({ phase: 'recap' }); return true }
  if (c === 'faster') { nudgeRate(RATE_STEP); await speak([es('Más rápido.')], g); return false }
  patch((l) => ({ asks: l.asks + 1 }))
  if (c === 'repeat') { await speak(lastSay, g, live.get()!.struggle ? 0.9 : 1); return false }
  if (c === 'slower') { nudgeRate(-RATE_STEP); await speak(lastSay, g, 0.9); return false }
  // "en inglés"
  addMine('en inglés')
  await tutorTurn([{ role: 'user', content: 'en inglés' }, { role: 'system', content: ENGLISH }], g)
  return false
}

function addMine(text: string) {
  patch((l) => ({
    bubbles: [...l.bubbles.map((b) => b.corrections ? { ...b, corrections: b.corrections.map((x) => ({ ...x, revealed: true })) } : b), { id: uid(), who: 'me' as const, text }],
    turns: l.turns + 1,
    myWords: l.myWords + wordCount(text),
  }))
}

/** One tutor turn: streams, speaks sentence by sentence, records mistakes. Returns "done". */
async function tutorTurn(add: Msg[], g: number): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    alive(g)
    const l = live.get()!
    const id = uid()
    patch({ status: 'thinking', error: undefined, bubbles: [...l.bubbles, { id, who: 'tutor', text: '', streaming: true }] })
    const mult = (getScenario(l.scenario).phone ? 1.1 : 1) * (l.struggle ? 0.9 : 1)
    const q = new SpeakQueue((lang) => sayOpts(l.stage, lang, mult))
    q.onStart = () => { if (gen === g) patch({ status: 'speaking' }) }
    const parser = new ReplyParser((s) => {
      q.push(s.text, s.lang)
      patch((cur) => ({ bubbles: cur.bubbles.map((b) => (b.id === id ? { ...b, text: (b.text + ' ' + s.text).trim() } : b)) }))
    })
    ctrl = new AbortController()
    try {
      const res = await call({ system, messages: [...history, ...add], maxTokens: 1200, kind: 'turn', session: l.id, onText: (d) => parser.push(d), signal: ctrl.signal })
      alive(g)
      const { segs, notes } = parser.end()
      history.push(...add, { role: 'assistant', content: res.content as unknown as Exclude<Msg['content'], string | undefined> } as Msg)
      if (segs.length) lastSay = segs
      const corrections: Correction[] = notes.mistakes.map((m) => ({ ...m, revealed: !m.ask }))
      const now = Date.now()
      const ms: Mistake[] = notes.mistakes.map((m) => ({ id: uid(), at: now, session: l.id, stage: l.stage, type: m.type, said: m.said, fix: m.fix, why: m.why, big: m.big }))
      addMistakes(ms)
      patch((cur) => {
        // Corrections belong under the learner's last message.
        const bubbles = cur.bubbles.map((b) => (b.id === id ? { ...b, text: segs.map((s) => s.text).join(' '), segs, streaming: false } : b))
        for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].who === 'me') { if (corrections.length) bubbles[i] = { ...bubbles[i], corrections }; break }
        return {
          bubbles,
          mistakes: [...cur.mistakes, ...ms],
          words: [...cur.words, ...notes.words.filter((w) => !cur.words.some((x) => norm(x.es) === norm(w.es)))],
          struggle: notes.struggle,
          tutorWords: cur.tutorWords + segs.filter((s) => s.lang === 'es').reduce((a, s) => a + wordCount(s.text), 0),
        }
      })
      saveRecord(live.get()!, false)
      await q.drain()
      alive(g)
      return notes.done
    } catch (e) {
      if (e instanceof Stop) throw e
      alive(g)
      stopSpeaking()
      patch((cur) => ({ bubbles: cur.bubbles.filter((b) => b.id !== id) }))
      const err = e instanceof AiError ? e : new AiError('other', e instanceof Error ? e.message : 'Something went wrong.')
      if (err.code === 'nokey' || err.code === 'key') { patch({ error: { msg: err.message }, status: 'idle' }); throw new Stop() }
      if (live.get()!.handsFree && attempt < 2) {
        await speak([es('Un momento, hay un problema de conexión.')], g)
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      // Wait for "Try again".
      patch({ error: { msg: err.message, retry: true }, status: 'paused' })
      pause(false)
      await waitIfPaused(g)
    }
  }
}

// ---------------- 3. Recap

async function recapPhase(g: number) {
  alive(g)
  const l = live.get()!
  patch({ phase: 'recap', status: 'thinking', interim: '', error: undefined })
  const minutes = Math.max(1, Math.round((Date.now() - l.startedAt) / 60000))
  const reviewed = l.review.items.filter((x) => x.grade).length
  const reviewOk = l.review.items.filter((x) => x.grade && x.grade !== 'wrong').length
  let fixes: Fix[] = [], words: Word[] = [], newCards: Card[] = [], noteEn = '', noteEs = '', level: string | undefined
  const now = Date.now()
  if (l.turns > 0 && history.length) {
    try {
      ctrl = new AbortController()
      const res = await call({ system, messages: [...history, { role: 'user', content: RECAP_USER }, { role: 'system', content: RECAP }], maxTokens: 2500, kind: 'recap', session: l.id, signal: ctrl.signal })
      alive(g)
      const r = parseRecap(res.text)
      if (r) {
        fixes = r.fixes; words = r.words; noteEn = r.noteEn; noteEs = r.noteEs; level = r.level
        newCards = r.cards.map((c) => newCard({ ...c, source: 'mistake' }, now))
      }
    } catch (e) { if (e instanceof Stop) throw e }
  }
  alive(g)
  if (!fixes.length) ({ fixes, words, cards: newCards } = localRecap(l, now))
  if (!noteEn) noteEn = l.turns ? 'Good work today. Keep speaking in full sentences.' : 'Review done.'
  const added = addCards(newCards, now)
  const spoke = l.myWords + l.tutorWords ? Math.round((100 * l.myWords) / (l.myWords + l.tutorWords)) : 0
  const recap: Recap = { fixes: fixes.slice(0, 3), words: words.slice(0, 3), noteEn, noteEs, level, added, spoke, minutes, reviewed, reviewOk }
  patch({ recap })
  const cur = live.get()!
  saveRecord(cur, cur.turns >= 3 || minutes >= 5, recap)
  // Level and Stage 2.
  const est = parseLevel(level)
  if (est != null && cur.turns >= 5) setProfile((p) => ({ level: blendLevel(p.level, est) }))
  if (!profile.get().stage2Unlocked && readyForStage2(profile.get().level, Object.values(sessions.get()))) setProfile({ stage2Unlocked: true, unlockSeen: false })
  // Read it aloud.
  const say: Seg[] = []
  if (recap.fixes.length) {
    say.push(en(`Your top ${recap.fixes.length === 1 ? 'fix' : `${recap.fixes.length} fixes`}.`))
    recap.fixes.forEach((f, i) => { say.push(en(`${['One', 'Two', 'Three'][i]}.`), es(f.fix)); if (f.why) say.push(en(f.why)) })
  }
  if (noteEs) say.push(es(noteEs)); else say.push(en(noteEn))
  try { await speak(say, g) } catch (e) { if (e instanceof Stop) throw e }
  alive(g)
  patch({ phase: 'done', status: 'idle' })
  void keepAwake(false)
}

/** Items already in the list come back tomorrow instead of being added twice. */
function addCards(list: Card[], now: number): number {
  const byAnswer = new Map(Object.values(cards.get()).map((c) => [norm(c.answer), c]))
  const out: Card[] = []
  for (const c of list) {
    const old = byAnswer.get(norm(c.answer))
    if (old) out.push({ ...old, due: Math.min(old.due, now + DAY), step: Math.min(old.step, 1) })
    else { out.push(c); byAnswer.set(norm(c.answer), c) }
  }
  saveCards(out)
  return out.length
}

const isType = (t: unknown): t is MistakeType => (MISTAKE_TYPES as string[]).includes(String(t))
const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parseRecap(text: string): { fixes: Fix[]; words: Word[]; cards: { cue: string; answer: string; alts: string[]; type: MistakeType }[]; noteEn: string; noteEs: string; level?: string } | null {
  const m = /<recap>([\s\S]*?)(?:<\/recap>|$)/.exec(text)
  const raw = m ? m[1] : text
  let j: Record<string, unknown>
  try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch { return null }
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === 'object') : [])
  const fixes = arr(j.fixes).map((f) => ({ type: isType(f.t) ? f.t : 'vocab' as MistakeType, said: s(f.said), fix: s(f.fix), why: s(f.why, 160) })).filter((f) => f.fix).slice(0, 3)
  const cards = arr(j.cards).map((c) => ({ cue: s(c.cue), answer: s(c.answer), alts: (Array.isArray(c.alts) ? c.alts : []).map((a: unknown) => s(a)).filter(Boolean).slice(0, 2), type: isType(c.t) ? c.t : 'vocab' as MistakeType })).filter((c) => c.cue && c.answer).slice(0, 6)
  const words = arr(j.words).map((w) => ({ es: s(w.es, 60), en: s(w.en, 60) })).filter((w) => w.es && w.en).slice(0, 3)
  return { fixes, words, cards, noteEn: s(j.note_en, 300), noteEs: s(j.note_es, 200), level: s(j.level, 4) || undefined }
}

/** Without the AI (offline, or it failed): the session's own big and repeated mistakes. */
export function localRecap(l: Pick<Live, 'mistakes' | 'words'>, _now: number): { fixes: Fix[]; words: Word[]; cards: Card[] } {
  const count = new Map<string, { m: Mistake; n: number }>()
  for (const m of l.mistakes) { const k = norm(m.fix); const c = count.get(k); count.set(k, { m, n: (c?.n ?? 0) + 1 }) }
  const top = [...count.values()].sort((a, b) => b.n - a.n || Number(b.m.big) - Number(a.m.big)).slice(0, 3).map((x) => x.m)
  const fixes = top.map((m) => ({ type: m.type, said: m.said, fix: m.fix, why: m.why }))
  const now = Date.now()
  const cs = [
    ...top.map((m) => newCard({ cue: m.said ? `Say it correctly: “${m.said}”` : m.why || 'Say it in Spanish', answer: m.fix, type: m.type, source: 'mistake' }, now)),
    ...l.words.slice(0, 3).map((w) => newCard({ cue: w.en, answer: w.es, type: 'vocab', source: 'word' }, now)),
  ]
  return { fixes, words: l.words.slice(0, 3), cards: cs }
}

function saveRecord(l: Live, completed: boolean, r?: Recap) {
  const prev = sessions.get()[l.id]
  const rec: SessionRec = {
    id: l.id, at: l.startedAt, stage: l.stage, scenario: l.scenario, handsFree: l.handsFree,
    minutes: Math.max(1, Math.round((Date.now() - l.startedAt) / 60000)),
    turns: l.turns, myWords: l.myWords, tutorWords: l.tutorWords,
    reviewed: l.review.items.filter((x) => x.grade).length, reviewOk: l.review.items.filter((x) => x.grade && x.grade !== 'wrong').length,
    mistakes: l.mistakes.length, big: l.mistakes.filter((m) => m.big).length, asks: l.asks,
    fixes: r?.fixes ?? prev?.fixes ?? [], words: r?.words ?? prev?.words ?? l.words.slice(0, 3),
    level: r?.level ?? prev?.level, note: r?.noteEn ?? prev?.note,
    completed: completed || !!prev?.completed,
  }
  saveSession(rec)
}

/** Restarts after an error ("Try again"). */
export function retry() {
  const l = live.get()
  if (!l) return
  if (l.phase === 'recap' && !l.recap) {
    const g = ++gen
    void recapPhase(g).catch((e) => { if (!(e instanceof Stop)) patch({ error: { msg: e instanceof Error ? e.message : 'Recap failed.' }, status: 'idle' }) })
    return
  }
  resume()
}
