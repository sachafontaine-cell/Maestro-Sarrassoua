// Injected into the page before the app starts: a fake microphone (speech recognition) and a
// fake voice (speech synthesis) that the tests drive. Headless Chromium has neither.
(() => {
  const stt = { active: null, queue: [], log: [], denied: false, silenceMs: 4000, started: 0 }
  window.__stt = stt
  class FakeRec {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1; this.onresult = null; this.onerror = null; this.onend = null; this.onspeechstart = null; this._timer = null }
    start() {
      stt.started++
      stt.log.push('start:' + this.lang)
      stt.active = this
      if (stt.denied) { setTimeout(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this._end() }, 10); return }
      if (stt.queue.length) { const t = stt.queue.shift(); setTimeout(() => this._say(t), 60); return }
      this._timer = setTimeout(() => { this.onerror && this.onerror({ error: 'no-speech' }); this._end() }, stt.silenceMs)
    }
    _say(t) {
      clearTimeout(this._timer)
      this.onspeechstart && this.onspeechstart()
      const res = [{ transcript: t }]
      res.isFinal = true
      this.onresult && this.onresult({ resultIndex: 0, results: [res] })
      setTimeout(() => this._end(), 20)
    }
    _end() { clearTimeout(this._timer); if (stt.active === this) stt.active = null; const f = this.onend; this.onend = null; f && f() }
    stop() { setTimeout(() => this._end(), 10) }
    abort() { setTimeout(() => this._end(), 5) }
  }
  window.SpeechRecognition = FakeRec
  window.webkitSpeechRecognition = FakeRec
  // Say something into the mic now (or as soon as it listens).
  window.__say = (t) => { if (stt.active) stt.active._say(t); else stt.queue.push(t) }

  const spoken = []
  window.__spoken = spoken
  const voices = [
    { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false, default: false, voiceURI: 'g-es-us' },
    { name: 'Español (México)', lang: 'es-MX', localService: true, default: false, voiceURI: 'es-mx' },
    { name: 'Español (España)', lang: 'es-ES', localService: true, default: false, voiceURI: 'es-es' },
    { name: 'Google US English', lang: 'en-US', localService: false, default: true, voiceURI: 'g-en-us' },
  ]
  const pending = new Set()
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => voices,
    speak(u) {
      if (!u.text.trim()) { setTimeout(() => u.onend && u.onend(), 1); return }
      spoken.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice && u.voice.name })
      synth.speaking = true
      const job = { u, t: setTimeout(() => { pending.delete(job); synth.speaking = pending.size > 0; u.onend && u.onend() }, Math.min(300, 30 + u.text.length * 2)) }
      pending.add(job)
    },
    cancel() { for (const j of pending) { clearTimeout(j.t); j.u.onerror && j.u.onerror({ error: 'interrupted' }) } pending.clear(); synth.speaking = false },
    pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {},
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.volume = 1; this.voice = null; this.onend = null; this.onerror = null } }
})()
