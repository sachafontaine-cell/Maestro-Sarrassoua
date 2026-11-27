// Gemini (free tier), straight from the phone. Same approach as Travel Sidekick and Chef Luc:
// Flash models, and when the newest one is busy (common on the free tier) the next one is tried;
// the one that answered is remembered (Settings keeps its name).
import { setSettings, settings } from './data'

const API = 'https://generativelanguage.googleapis.com/v1beta'

/** Pasted keys often carry spaces, line breaks, quotes or invisible characters: keep only key characters. */
export const cleanKey = (k: string) => k.replace(/[^\w.\-]/g, '')
/** Anything that isn't a Claude key is treated as a Gemini key; Google decides if it's valid. */
export const isGeminiKey = (k: string | undefined) => !!k && cleanKey(k).length >= 10 && !/^sk-ant-/.test(cleanKey(k))

export class GeminiError extends Error {
  constructor(message: string, readonly status = 0, readonly retry = false) { super(message) }
}

export interface GeminiMsg { role: 'user' | 'model'; text: string }
export interface GeminiResult { text: string; model: string; input: number; cached: number; output: number }

/** Little hidden thinking on conversation turns: it only adds waiting. */
function thinkingFor(model: string, effort: 'low' | 'medium'): object | undefined {
  // Grading gets a little room to think, capped: unlimited thinking is what made it time out.
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: effort === 'medium' ? 1024 : 0 }
  if (/^gemini-[3-9]|flash-latest/.test(model)) return { thinkingLevel: 'low' }
  return undefined
}

async function failure(r: Response, model: string, thinking: boolean): Promise<GeminiError | 'drop-thinking'> {
  let msg = ''
  try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
  if (r.status === 400 && thinking && /think/i.test(msg)) return 'drop-thinking'
  const short = msg.split(/(?<=\.)\s/)[0].slice(0, 120)
  if (r.status === 429) return new GeminiError('Free limit reached for the moment. Try again in a minute.', 429, true)
  if (r.status === 400 && /api key/i.test(msg)) return new GeminiError('Gemini refused the API key. Check it in Settings.', 400)
  if (r.status === 403) return new GeminiError('Gemini refused the API key (restricted, or the API is off). Check it in Settings.', 403)
  if (r.status === 404) return new GeminiError(`Model ${model} is not available for this key.`, 404, true)
  if (r.status >= 500) return new GeminiError('Gemini is busy right now.', r.status, true)
  return new GeminiError(`Gemini error ${r.status}${short ? ` (${short})` : ''}`, r.status)
}

/** The text of a streamed piece, without the model's hidden reasoning. */
export function answerText(j: any): string {
  return (j?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('')
}

/** One streamed answer from one model. `onDelta` gets each new piece of text. */
async function streamOnce(key: string, model: string, body: Record<string, unknown>, effort: 'low' | 'medium', onDelta: (d: string) => void, signal?: AbortSignal, thinking = true): Promise<GeminiResult> {
  // Time to the first words (thinking happens before them), then time between pieces.
  const firstMs = effort === 'medium' ? 90000 : 45000
  const t = thinking ? thinkingFor(model, effort) : undefined
  const gen = { ...(body.generationConfig as object), ...(t ? { thinkingConfig: t } : {}) }
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  signal?.addEventListener('abort', stop)
  let timer = setTimeout(stop, firstMs)
  const poke = () => { clearTimeout(timer); timer = setTimeout(stop, 30000) }
  let all = '', input = 0, cached = 0, output = 0, sent = 0
  try {
    const r = await fetch(`${API}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ ...body, generationConfig: gen }), signal: ctrl.signal,
    })
    if (!r.ok || !r.body) {
      const f = await failure(r, model, !!t)
      if (f === 'drop-thinking') return streamOnce(key, model, body, effort, onDelta, signal, false)
      throw f
    }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      poke()
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('data:')) continue
        let j: any
        try { j = JSON.parse(line.slice(5)) } catch { continue }
        const piece = answerText(j)
        if (piece) { all += piece; sent++; onDelta(piece) }
        const u = j.usageMetadata
        if (u) { input = u.promptTokenCount ?? input; cached = u.cachedContentTokenCount ?? cached; output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) || output }
      }
    }
    if (!all) throw new GeminiError('Gemini sent an empty answer.', 0, true)
    return { text: all, model, input, cached, output }
  } catch (e) {
    if (e instanceof GeminiError) throw e
    if (signal?.aborted) throw new GeminiError('Stopped.')
    // Lost mid-answer after some text arrived: that piece already played; don't retry on another model.
    if (sent) return { text: all, model, input, cached, output }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GeminiError('No internet connection.')
    throw new GeminiError('Lost the connection to Gemini.', 0, true)
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop) }
}

/** Flash models this key can use, best first. Also how a key is checked (no request spent). */
export async function flashModels(key: string): Promise<string[]> {
  let r: Response
  try { r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }) } catch { throw new GeminiError('No internet connection.') }
  if (!r.ok) {
    let msg = ''
    try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
    const why = msg ? ` Google says: “${msg.slice(0, 160)}”` : ''
    if (r.status === 400 || r.status === 403) throw new GeminiError(`Gemini refused the key.${why}`, r.status)
    throw new GeminiError(`Gemini error ${r.status}.${why}`, r.status)
  }
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  const v = (n: string) => parseFloat(n.slice(7)) || 0
  const pick = (re: RegExp) => names.filter((n) => re.test(n)).sort((a, b) => v(b) - v(a))
  return [...new Set([
    ...pick(/^gemini-[\d.]+-flash$/).slice(0, 3),
    ...names.filter((n) => n === 'gemini-flash-latest'),
    ...pick(/^gemini-[\d.]+-flash-lite$/).slice(0, 2),
    ...names.filter((n) => n === 'gemini-flash-lite-latest'),
  ])]
}

// A busy model is skipped for 15 minutes (kept in memory for this visit).
const busyUntil = new Map<string, number>()
let modelsCache: { key: string; list: string[]; at: number } | undefined

export function modelOrder(good: string | undefined, available: string[], now = Date.now()): string[] {
  const pool = [...new Set([good, ...available].filter((m): m is string => !!m && (!available.length || available.includes(m))))]
  const busy = (m: string) => (busyUntil.get(m) ?? 0) > now
  return [...pool.filter((m) => !busy(m)), ...pool.filter(busy)]
}

/** One streamed turn, moving to the next model while one is busy. */
export async function geminiStream(key: string, system: string, msgs: GeminiMsg[], o: { maxTokens: number; effort: 'low' | 'medium'; json?: boolean; onDelta: (d: string) => void; signal?: AbortSignal }): Promise<GeminiResult> {
  if (!modelsCache || modelsCache.key !== key || Date.now() - modelsCache.at > 6 * 3600000) {
    try { modelsCache = { key, list: await flashModels(key), at: Date.now() } } catch (e) { if (!settings.get().geminiModel) throw e }
  }
  const order = modelOrder(settings.get().geminiModel, modelsCache?.list ?? []).slice(0, 4)
  if (!order.length) throw new GeminiError('No Gemini Flash model is available for this key.')
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    // Thinking counts against the output limit on Gemini: leave room for it.
    generationConfig: { maxOutputTokens: o.maxTokens + (o.effort === 'medium' ? 2048 : 0), ...(o.json ? { responseMimeType: 'application/json' } : {}) },
  }
  let last: unknown
  // Free tier: when every model is busy, wait a little and go round once more (only before
  // any words were spoken, so nothing is said twice).
  for (const [i, model] of [...order, ...order].entries()) {
    if (i === order.length) await new Promise((r) => setTimeout(r, 4000))
    if (o.signal?.aborted) break
    try {
      const r = await streamOnce(key, model, body, o.effort, o.onDelta, o.signal)
      if (settings.get().geminiModel !== model) setSettings({ geminiModel: model })
      return r
    } catch (e) {
      last = e
      if (!(e instanceof GeminiError && e.retry) || o.signal?.aborted) throw e
      busyUntil.set(model, Date.now() + 15 * 60000)
    }
  }
  throw last
}
