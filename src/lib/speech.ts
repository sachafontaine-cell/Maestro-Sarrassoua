// The phone's own voice tools (Web Speech API in Chrome): speech recognition for what you say,
// speech synthesis for the tutor. Both run sentence by sentence; nothing here needs the AI.

// ---------------- Voices

export type VoiceLang = 'es-MX' | 'es-CO' | 'en-US'

let voiceList: SpeechSynthesisVoice[] = []
const synth = () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null)

/** The phone's voices (Chrome loads them a moment after start). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth()
  if (!s) return Promise.resolve([])
  voiceList = s.getVoices()
  if (voiceList.length) return Promise.resolve(voiceList)
  return new Promise((resolve) => {
    const done = () => { voiceList = s.getVoices(); resolve(voiceList) }
    s.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}
export const voices = () => voiceList

/** How well a voice fits an accent: same country first, then Latin American Spanish, Spain last. */
export function voiceScore(v: Pick<SpeechSynthesisVoice, 'lang' | 'name' | 'localService'>, want: VoiceLang): number {
  const lang = v.lang.replace('_', '-').toLowerCase()
  const w = want.toLowerCase()
  let s = 0
  if (w.startsWith('en')) {
    if (!lang.startsWith('en')) return -1
    s = lang === 'en-us' ? 50 : lang === 'en-gb' ? 40 : 30
  } else {
    if (!lang.startsWith('es')) return -1
    if (lang === w) s = 100
    else if (lang === 'es-us' || lang === 'es-419') s = 70
    else if (lang === 'es-mx' || lang === 'es-co') s = 60
    else if (lang === 'es-es') s = 20
    else s = 40
  }
  if (/google/i.test(v.name)) s += 6
  if (/natural|neural|enhanced|premium/i.test(v.name)) s += 4
  if (v.localService) s += 2
  return s
}

export function bestVoice(want: VoiceLang, chosen?: string, list = voiceList): SpeechSynthesisVoice | undefined {
  if (chosen) { const v = list.find((x) => x.name === chosen); if (v) return v }
  let best: SpeechSynthesisVoice | undefined, score = -1
  for (const v of list) { const s = voiceScore(v, want); if (s > score) { best = v; score = s } }
  return score >= 0 ? best : undefined
}
export const voicesFor = (want: VoiceLang, list = voiceList) =>
  list.filter((v) => voiceScore(v, want) >= 0).sort((a, b) => voiceScore(b, want) - voiceScore(a, want))

// ---------------- Speaking

export interface SayOpts { lang: VoiceLang; voice?: SpeechSynthesisVoice; rate: number }

/** Long text cut at sentence ends (Chrome stops long utterances on its own). */
export function chunks(text: string, max = 180): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    let s = sentence.trim()
    while (s.length > max) {
      const cut = s.lastIndexOf(',', max) > 40 ? s.lastIndexOf(',', max) + 1 : s.lastIndexOf(' ', max)
      out.push(s.slice(0, cut > 0 ? cut : max).trim()); s = s.slice(cut > 0 ? cut : max).trim()
    }
    if (s) out.push(s)
  }
  return out
}

let speakGen = 0

/** Speaks one piece of text; resolves when done (or stopped). */
export function speakOne(text: string, o: SayOpts): Promise<void> {
  const s = synth()
  if (!s || !text.trim()) return Promise.resolve()
  const gen = speakGen
  return chunks(text).reduce<Promise<void>>((p, part) => p.then(() => gen !== speakGen ? undefined : new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(part)
    u.lang = o.voice?.lang ?? o.lang
    if (o.voice) u.voice = o.voice
    u.rate = o.rate
    // Chrome sometimes never fires "end": a safety timer based on the length.
    const t = setTimeout(done, (2500 + part.length * 95) / Math.max(0.5, o.rate))
    const finish = () => { clearTimeout(t); done() }
    u.onend = finish
    u.onerror = finish
    if (s.paused) s.resume()
    s.speak(u)
  })), Promise.resolve())
}

/** Stops speaking right away (and anything queued). */
export function stopSpeaking() {
  speakGen++
  synth()?.cancel()
}
export const isSpeaking = () => !!synth()?.speaking

/**
 * A queue the streaming tutor reply is pushed into sentence by sentence. `drain()` resolves
 * when everything pushed so far has been spoken.
 */
export class SpeakQueue {
  private chain: Promise<void> = Promise.resolve()
  private gen = speakGen
  started = false
  onStart: () => void = () => {}
  constructor(private opts: (lang: 'es' | 'en') => SayOpts) {}
  push(text: string, lang: 'es' | 'en') {
    this.chain = this.chain.then(() => {
      if (this.gen !== speakGen) return
      if (!this.started) { this.started = true; this.onStart() }
      return speakOne(text, this.opts(lang))
    })
  }
  drain() { return this.chain }
}

/** Chrome on Android only lets a page speak after a tap: call this inside the tap. */
export function unlockSpeech() {
  const s = synth()
  if (!s) return
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u) } catch { /* ignore */ }
}

// ---------------- Listening

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start(): void; stop(): void; abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechstart?: (() => void) | null
}
const RecCtor = (): (new () => Rec) | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
export const canListen = () => !!RecCtor()

export class MicError extends Error {
  constructor(public code: 'denied' | 'unsupported' | 'network' | 'other', msg: string) { super(msg) }
}

export interface ListenOpts {
  lang: string
  /** Keep listening through pauses until stop() (tap-to-talk). Otherwise ends at the first pause. */
  untilStopped: boolean
  onInterim?: (text: string) => void
  onSpeech?: () => void
}

export interface Listening {
  /** What was said (empty if nothing). */
  result: Promise<string>
  /** Finish now and keep what was heard. */
  stop(): void
  /** Finish now and drop it. */
  cancel(): void
}

export function listen(o: ListenOpts): Listening {
  const Ctor = RecCtor()
  if (!Ctor) {
    const err = new MicError('unsupported', 'Speech recognition isn’t available in this browser. Use Chrome, or type your answer.')
    return { result: Promise.reject(err), stop() {}, cancel() {} }
  }
  let finals = ''
  let interim = ''
  let stopped = false
  let cancelled = false
  let rec: Rec | null = null
  let resolve!: (s: string) => void, reject!: (e: unknown) => void
  const result = new Promise<string>((ok, no) => { resolve = ok; reject = no })
  let settled = false
  const finish = () => { if (settled) return; settled = true; resolve(cancelled ? '' : (finals + ' ' + interim).replace(/\s+/g, ' ').trim()) }
  let restarts = 0

  const start = () => {
    const r = new Ctor()
    rec = r
    r.lang = o.lang
    r.continuous = false // Chrome on Android repeats words in continuous mode: restart instead.
    r.interimResults = true
    r.maxAlternatives = 1
    r.onspeechstart = () => o.onSpeech?.()
    r.onresult = (e) => {
      let fin = '', mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) fin += res[0].transcript; else mid += res[0].transcript
      }
      if (fin) { finals = (finals + ' ' + fin).trim(); interim = '' } else interim = mid
      if (fin || mid) o.onSpeech?.()
      o.onInterim?.((finals + ' ' + interim).trim())
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        settled = true
        reject(new MicError('denied', 'The microphone is blocked for this app.'))
      } else if (e.error === 'network') {
        settled = true
        reject(new MicError('network', 'Speech recognition needs the internet. Check the connection.'))
      } else if (e.error === 'audio-capture') {
        settled = true
        reject(new MicError('other', 'No microphone found.'))
      }
      // "no-speech" and "aborted" just end; onend decides.
    }
    r.onend = () => {
      if (settled) return
      interim && (finals = (finals + ' ' + interim).trim(), interim = '')
      if (o.untilStopped && !stopped && !cancelled && restarts < 40) { restarts++; try { start() } catch { finish() } return }
      finish()
    }
    try { r.start() } catch { finish() }
  }
  start()
  return {
    result,
    stop() { stopped = true; try { rec?.stop() } catch { finish() } setTimeout(finish, 1200) },
    cancel() { cancelled = true; stopped = true; try { rec?.abort() } catch { /* gone */ } finish() },
  }
}
