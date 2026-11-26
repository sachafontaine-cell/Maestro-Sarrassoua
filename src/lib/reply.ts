// Reads the tutor's answer while it streams in. The tutor writes what it says in <say> blocks
// (Spanish, or lang="en" for English), then <notes>{json}</notes> with the mistakes it noticed.
// Each finished sentence is handed to the voice right away, so speaking starts after the first
// sentence instead of after the whole answer.
import { MISTAKE_TYPES, type MistakeType, type Word } from './model'

export interface Seg { text: string; lang: 'es' | 'en' }
export interface NoteMistake { type: MistakeType; said: string; fix: string; why: string; big: boolean; ask: boolean }
export interface Notes { mistakes: NoteMistake[]; struggle: boolean; done: boolean; words: Word[] }

const SENTENCE_END = /[.!?…](?:["»”')\]]*)\s+/g

/** What can't be spoken: markdown marks, emoji, stray tags. */
export const clean = (s: string) =>
  s.replace(/<[^>]*>/g, ' ')
    .replace(/[*_#`~]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ').trim()

export class ReplyParser {
  private buf = ''
  private pos = 0
  private say: { lang: 'es' | 'en' } | null = null
  private sawSay = false
  private parts: (Seg & { open: boolean })[] = []
  constructor(private onSentence: (s: Seg) => void = () => {}) {}

  push(delta: string) {
    this.buf += delta
    this.scan(false)
  }

  private emit(text: string, lang: 'es' | 'en') {
    const t = clean(text)
    if (!t) return
    this.onSentence({ text: t, lang })
    const last = this.parts[this.parts.length - 1]
    if (last && last.lang === lang && last.open) last.text += ' ' + t
    else this.parts.push({ text: t, lang, open: true })
  }

  private scan(final: boolean) {
    for (;;) {
      if (!this.say) {
        const i = this.buf.indexOf('<say', this.pos)
        if (i < 0) return
        const close = this.buf.indexOf('>', i)
        if (close < 0) return
        const tag = this.buf.slice(i, close + 1)
        this.say = { lang: /lang\s*=\s*["']?en/i.test(tag) ? 'en' : 'es' }
        this.sawSay = true
        this.pos = close + 1
        continue
      }
      const end = this.buf.indexOf('</say>', this.pos)
      if (end >= 0) {
        this.emitSentences(this.buf.slice(this.pos, end))
        for (const s of this.parts) s.open = false
        this.pos = end + 6
        this.say = null
        continue
      }
      // Inside a block that is still streaming: speak the sentences that are complete.
      let body = this.buf.slice(this.pos)
      const notes = body.indexOf('<notes')
      if (notes >= 0) body = body.slice(0, notes) // a missing </say>: never read the notes aloud
      const safe = body.replace(/<\/?s?a?y?$/, '') // a closing tag arriving in pieces
      if (final) { this.emitSentences(safe); this.pos = this.buf.length; this.say = null; return }
      let cut = -1
      SENTENCE_END.lastIndex = 0
      for (let m; (m = SENTENCE_END.exec(safe));) cut = m.index + m[0].length
      if (cut > 0) { this.emitSentences(safe.slice(0, cut)); this.pos += cut }
      return
    }
  }

  private emitSentences(text: string) {
    const lang = this.say?.lang ?? 'es'
    const parts: string[] = []
    let last = 0
    SENTENCE_END.lastIndex = 0
    for (let m; (m = SENTENCE_END.exec(text));) { parts.push(text.slice(last, m.index + m[0].length)); last = m.index + m[0].length }
    parts.push(text.slice(last))
    for (const p of parts) this.emit(p, lang)
  }

  /** Call when the stream is over: speaks what's left and returns the whole reply. */
  end(): { segs: Seg[]; notes: Notes } {
    this.scan(true)
    if (!this.sawSay) {
      // The tutor forgot the format: everything outside <notes> is speech.
      const plain = this.buf.replace(/<notes>[\s\S]*?(<\/notes>|$)/, '')
      this.emitSentences(plain)
    }
    const segs = this.parts.map(({ text, lang }) => ({ text, lang }))
    return { segs, notes: parseNotes(this.buf) }
  }
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parseNotes(all: string): Notes {
  const empty: Notes = { mistakes: [], struggle: false, done: false, words: [] }
  const m = /<notes>([\s\S]*?)(?:<\/notes>|$)/.exec(all)
  if (!m) return empty
  let j: Record<string, unknown>
  try {
    const raw = m[1].trim().replace(/^```(?:json)?/, '').replace(/```$/, '')
    j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch { return empty }
  const list = Array.isArray(j.m) ? j.m : Array.isArray(j.mistakes) ? j.mistakes : []
  const mistakes: NoteMistake[] = []
  for (const x of list as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') continue
    const type = (MISTAKE_TYPES as string[]).includes(String(x.t ?? x.type)) ? (String(x.t ?? x.type) as MistakeType) : 'vocab'
    const fix = str(x.fix), said = str(x.said)
    if (!fix) continue
    mistakes.push({ type, said, fix, why: str(x.why, 160), big: x.big === true, ask: x.ask === true })
  }
  const words: Word[] = []
  for (const w of (Array.isArray(j.new) ? j.new : []) as Record<string, unknown>[]) {
    if (w && str(w.es) && str(w.en)) words.push({ es: str(w.es, 60), en: str(w.en, 60) })
  }
  return { mistakes: mistakes.slice(0, 4), struggle: j.struggle === true, done: j.done === true, words: words.slice(0, 3) }
}
