import { describe, expect, it } from 'vitest'
import { ReplyParser, parseNotes } from './reply'
import { command } from './commands'
import { grade, norm } from './grade'
import { AFTER_SUCCESS, DAY, dueCards, newCard, review } from './srs'
import { usd, totals } from './cost'
import { blendLevel, levelLabel, levelProgress, parseLevel, pickScenario, readyForStage2, streak, weakness, rankWeak, priorFrom, PRIOR } from './plan'
import { bestVoice, chunks, voiceScore } from './speech'
import { flattenSystem } from './ai'
import { parseRecap, localRecap } from './session'
import { parsePlacement } from './placement'
import { sessionBlock, TUTOR } from './prompts'
import type { Mistake, SessionRec } from './model'

const sess = (p: Partial<SessionRec>): SessionRec => ({ id: Math.random().toString(36), at: Date.now(), stage: 1, scenario: 'tasks', handsFree: false, minutes: 15, turns: 10, myWords: 100, tutorWords: 90, reviewed: 0, reviewOk: 0, mistakes: 2, big: 1, asks: 0, fixes: [], words: [], completed: true, ...p })
const mis = (p: Partial<Mistake>): Mistake => ({ id: Math.random().toString(36), at: Date.now(), session: 's', stage: 1, type: 'verb', said: 'yo va', fix: 'yo voy', why: '', big: false, ...p })

describe('tutor reply stream', () => {
  it('speaks each sentence as soon as it is complete, and reads the notes', () => {
    const heard: string[] = []
    const p = new ReplyParser((s) => heard.push(`${s.lang}:${s.text}`))
    const text = '<say>¡Hola! ¿Qué hizo ayer?</say>\n<notes>{"m":[{"t":"verb","said":"yo va","fix":"yo voy","why":"ir","big":true,"ask":true}],"struggle":false,"done":false,"new":[{"es":"la llave","en":"the faucet"}]}</notes>'
    // Stream it in small pieces.
    for (let i = 0; i < text.length; i += 3) {
      p.push(text.slice(i, i + 3))
      if (i === 9) expect(heard).toEqual(['es:¡Hola!']) // after "<say>¡Hola! " arrives
    }
    const { segs, notes } = p.end()
    expect(heard).toEqual(['es:¡Hola!', 'es:¿Qué hizo ayer?'])
    expect(segs).toEqual([{ text: '¡Hola! ¿Qué hizo ayer?', lang: 'es' }])
    expect(notes.mistakes).toEqual([{ type: 'verb', said: 'yo va', fix: 'yo voy', why: 'ir', big: true, ask: true }])
    expect(notes.words).toEqual([{ es: 'la llave', en: 'the faucet' }])
  })
  it('handles English explanations and a forgotten format', () => {
    const p = new ReplyParser()
    p.push('<say lang="en">It means: what did you do?</say><say>¿Qué hizo usted?</say><notes>{"m":[]}</notes>')
    expect(p.end().segs).toEqual([{ text: 'It means: what did you do?', lang: 'en' }, { text: '¿Qué hizo usted?', lang: 'es' }])
    const q = new ReplyParser()
    q.push('Muy bien. ¿Y usted? <notes>{"m":[]}</notes>')
    expect(q.end().segs).toEqual([{ text: 'Muy bien. ¿Y usted?', lang: 'es' }])
  })
  it('never reads the notes aloud, even without </say>', () => {
    const p = new ReplyParser()
    p.push('<say>Claro. <notes>{"m":[],"done":true}</notes>')
    const r = p.end()
    expect(r.segs).toEqual([{ text: 'Claro.', lang: 'es' }])
    expect(r.notes.done).toBe(true)
  })
  it('survives broken notes', () => {
    expect(parseNotes('<notes>{not json</notes>').mistakes).toEqual([])
    expect(parseNotes('<notes>{"m":[{"t":"weird","fix":"nadar"}]}</notes>').mistakes[0].type).toBe('vocab')
  })
})

describe('voice commands', () => {
  it('recognises short commands only', () => {
    expect(command('Repite, por favor.')).toBe('repeat')
    expect(command('Más despacio')).toBe('slower')
    expect(command('mas rapido')).toBe('faster')
    expect(command('En inglés')).toBe('english')
    expect(command('Terminar.')).toBe('end')
    expect(command('Voy a terminar la cocina mañana')).toBe(null)
    expect(command('repite la frase de ayer por favor')).toBe(null)
  })
})

describe('grading spoken answers', () => {
  it('ignores accents, punctuation and filler, forgives small slips', () => {
    expect(norm('¿Qué hizo ayer?')).toBe('que hizo ayer')
    expect(grade('que hizo ayer', '¿Qué hizo ayer?')).toBe('right')
    expect(grade('voy a limpiar la cosina', 'Voy a limpiar la cocina.')).toBe('right')
    expect(grade('la palabra es nadar', 'nadar')).toBe('right')
    expect(grade('nager', 'nadar')).not.toBe('right')
    expect(grade('ahí', 'allá', ['ahí'])).toBe('right')
    expect(grade('', 'nadar')).toBe('wrong')
    expect(grade('yo va a limpiar la cocina', 'Voy a limpiar la cocina.')).not.toBe('wrong')
  })
})

describe('spaced review', () => {
  it('comes back after 1 day, 3 days, 1 week, 2 weeks, 1 month; a miss starts over', () => {
    const t0 = 1_700_000_000_000
    let c = newCard({ cue: 'to swim', answer: 'nadar', type: 'french', source: 'mistake' }, t0)
    expect(c.due).toBe(t0 + DAY)
    const gaps: number[] = []
    let t = c.due
    for (let i = 0; i < 5; i++) { c = review(c, true, 'nadar', t); gaps.push((c.due - t) / DAY); t = c.due }
    expect(gaps).toEqual(AFTER_SUCCESS)
    c = review(c, false, 'nager', t)
    expect(c.step).toBe(0)
    expect(c.lapses).toBe(1)
    expect(c.due).toBe(t + DAY)
  })
  it('picks due items, most-missed first, without duplicates', () => {
    const now = Date.now()
    const a = { ...newCard({ cue: 'a', answer: 'uno', type: 'vocab', source: 'seed' }, now, true), lapses: 0 }
    const b = { ...newCard({ cue: 'b', answer: 'dos', type: 'vocab', source: 'seed' }, now, true), lapses: 3 }
    const dup = { ...newCard({ cue: 'b2', answer: 'Dos', type: 'vocab', source: 'seed' }, now, true) }
    const later = newCard({ cue: 'c', answer: 'tres', type: 'vocab', source: 'seed' }, now)
    expect(dueCards([a, b, dup, later], now).map((c) => c.answer)).toEqual(['dos', 'uno'])
  })
})

describe('cost', () => {
  it('prices Sonnet 5.5 tokens, with cache reads at $0.10/M', () => {
    expect(usd('claude-sonnet-5-5', { input: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 })).toBeCloseTo(2)
    expect(usd('claude-sonnet-5-5', { input: 0, cacheWrite: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 })).toBeCloseTo(2.5 + 0.1 + 10)
  })
  it('adds up per session and per month', () => {
    const now = new Date(2026, 10, 26).getTime()
    const u = [
      { id: '1', at: now, session: 'a', kind: 'turn' as const, model: 'm', input: 0, cacheWrite: 0, cacheRead: 0, output: 0, usd: 0.02 },
      { id: '2', at: now, session: 'a', kind: 'recap' as const, model: 'm', input: 0, cacheWrite: 0, cacheRead: 0, output: 0, usd: 0.01 },
      { id: '3', at: new Date(2026, 9, 2).getTime(), session: 'b', kind: 'turn' as const, model: 'm', input: 0, cacheWrite: 0, cacheRead: 0, output: 0, usd: 0.05 },
    ]
    const t = totals(u, now)
    expect(t.thisMonth).toBeCloseTo(0.03)
    expect(t.allTime).toBeCloseTo(0.08)
    expect(t.perSession('a')).toBeCloseTo(0.03)
    expect(t.avgSession).toBeCloseTo(0.04)
  })
})

describe('level, weak spots, scenario, streak, Stage 2', () => {
  it('reads and shows levels', () => {
    expect(parseLevel('A2-')).toBe(1.75)
    expect(parseLevel('B1')).toBe(3)
    expect(parseLevel('nope')).toBe(null)
    expect(levelLabel(1.5)).toBe('A1+')
    expect(levelProgress(1.75)).toEqual({ label: 'A1+', next: 'A2', pct: 0.5 })
    expect(blendLevel(1.5, 2)).toBe(1.58)
  })
  it('starts from the placement findings, then follows real mistakes', () => {
    const now = Date.now()
    expect(rankWeak(weakness([], [], now))[0]).toBe('verb')
    const ms = Array.from({ length: 12 }, () => mis({ type: 'gender', big: true }))
    expect(rankWeak(weakness(ms, [], now))[0]).toBe('gender')
    expect(priorFrom({ placements: [] })).toBe(PRIOR)
    const pr = priorFrom({ placements: [{ at: now, level: 2, label: 'A2', summary: '', weak: ['listening'], scores: { listening: 0.2, verb: 0.9 } }] })
    expect(pr.listening).toBeGreaterThan(pr.verb)
  })
  it('aims today’s scenario at the weakest areas and at what is not practised lately', () => {
    const now = Date.now()
    expect(pickScenario(1, ['french', 'vocab', 'verb', 'listening', 'gender'], {}, now).focus).toEqual(expect.arrayContaining(['french', 'vocab']))
    // Practised yesterday: another scenario with the same focus comes first.
    expect(pickScenario(1, ['french', 'vocab', 'verb', 'listening', 'gender'], { laundry: now - DAY }, now).id).toBe('missing')
    expect(pickScenario(1, ['verb', 'listening', 'vocab', 'french', 'gender'], {}, now).focus).toContain('verb')
    expect(pickScenario(2, ['listening', 'verb', 'vocab', 'french', 'gender'], {}, now).stage).toBe(2)
  })
  it('counts the streak', () => {
    const now = new Date(2026, 10, 26, 12).getTime()
    const day = (d: number) => sess({ at: now - d * DAY })
    expect(streak([day(0), day(1), day(2), day(4)], now)).toBe(3)
    expect(streak([day(1), day(2)], now)).toBe(2) // today not done yet: still alive
    expect(streak([day(2)], now)).toBe(0)
  })
  it('unlocks Stage 2 at A2 with 8 sessions and few big mistakes', () => {
    const eight = Array.from({ length: 8 }, () => sess({ big: 1, turns: 10 }))
    expect(readyForStage2(2.0, eight)).toBe(true)
    expect(readyForStage2(1.9, eight)).toBe(false)
    expect(readyForStage2(2.0, eight.slice(1))).toBe(false)
    expect(readyForStage2(2.0, eight.map((s) => ({ ...s, big: 6 })))).toBe(false)
  })
})

describe('voices', () => {
  const v = (lang: string, name = 'x', localService = true) => ({ lang, name, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice
  it('prefers the country, then Latin American Spanish, Spain last', () => {
    const list = [v('es-ES', 'Spain'), v('es-US', 'Google español de Estados Unidos'), v('es-MX', 'Mexico'), v('en-US', 'English')]
    expect(bestVoice('es-MX', undefined, list)!.name).toBe('Mexico')
    expect(bestVoice('es-CO', undefined, list)!.lang).toBe('es-US')
    expect(bestVoice('en-US', undefined, list)!.name).toBe('English')
    expect(bestVoice('es-MX', 'Spain', list)!.name).toBe('Spain')
    expect(voiceScore(v('fr-FR'), 'es-MX')).toBe(-1)
  })
  it('cuts long text at sentence ends', () => {
    const long = 'Hola. ' + 'palabra '.repeat(40) + 'fin.'
    expect(chunks(long).every((c) => c.length <= 180)).toBe(true)
    expect(chunks('Uno. Dos.')).toEqual(['Uno.', 'Dos.'])
  })
})

describe('AI requests', () => {
  it('the plain form folds app messages into the learner turn', () => {
    expect(flattenSystem([{ role: 'user', content: 'hola' }, { role: 'system', content: 'wrap up' }])).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hola' }, { type: 'text', text: '[App: wrap up]' }] }])
  })
  it('the cached tutor prompt is long enough to cache and never changes', () => {
    expect(TUTOR.length).toBeGreaterThan(4000) // > 512 tokens
    expect(TUTOR).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    const block = sessionBlock({ stage: 2, scenarioId: 'invite', region: 'medellin', level: 2, weak: ['verb', 'listening', 'french', 'vocab', 'gender'], recurring: [mis({})], words: [], handsFree: true, minutes: 13 })
    expect(block).toContain('CATALINA')
    expect(block).toContain('Medellín')
    expect(block).toContain('HANDS-FREE')
    expect(block).toContain('"yo voy"')
  })
  it('reads the recap and the placement result', () => {
    const r = parseRecap('<recap>{"fixes":[{"t":"verb","said":"yo va","fix":"yo voy","why":"ir"}],"cards":[{"cue":"How do you say: I go?","answer":"Voy.","alts":["Yo voy."],"t":"verb"}],"words":[{"es":"la llave","en":"faucet"}],"level":"A2-","note_en":"Good.","note_es":"Bien."}</recap>')!
    expect(r.fixes[0].fix).toBe('yo voy')
    expect(r.cards[0].alts).toEqual(['Yo voy.'])
    expect(r.level).toBe('A2-')
    expect(parseRecap('nothing')).toBe(null)
    const p = parsePlacement('<result>{"level":"A2-","summary":"ok","scores":{"verb":0.4,"listening":2},"weak":["verb","bogus"],"cards":[]}</result>')!
    expect(p.level).toBe(1.75)
    expect(p.scores).toEqual({ verb: 0.4, listening: 1 })
    expect(p.weak).toEqual(['verb'])
  })
  it('makes a recap without the AI from the session’s own mistakes', () => {
    const r = localRecap({ mistakes: [mis({}), mis({}), mis({ type: 'french', said: 'nager', fix: 'nadar', big: true })], words: [{ es: 'la llave', en: 'faucet' }] }, Date.now())
    expect(r.fixes.map((f) => f.fix)).toEqual(['yo voy', 'nadar'])
    expect(r.cards.map((c) => c.answer)).toEqual(['yo voy', 'nadar', 'la llave'])
  })
})

import { isGeminiKey, modelOrder } from './gemini'
describe('Gemini', () => {
  it('tells a Gemini key from a Claude key', () => {
    expect(isGeminiKey('AIzaSyA1234567890abcdefghijklmnopqrstu')).toBe(true)
    expect(isGeminiKey('sk-ant-api03-xyz')).toBe(false)
    expect(isGeminiKey(undefined)).toBe(false)
  })
  it('tries the model that answered last first', () => {
    expect(modelOrder('gemini-2.5-flash', ['gemini-3.0-flash', 'gemini-2.5-flash'])).toEqual(['gemini-2.5-flash', 'gemini-3.0-flash'])
  })
})
