// The only place the app talks to the AI, straight from the phone (no server in between).
// Which AI is decided by the key pasted in Settings: Gemini ("AIza…", free tier, gemini.ts) or
// Claude ("sk-ant-…", below). The key stays on the phone and is only ever sent to that AI's
// own address. Nothing here logs it.
import type Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam, BetaContentBlock, BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { addUsage, setSettings, settings } from './data'
import { MODEL, usd } from './cost'
import { uid } from './store'
import type { Usage } from './model'
import { GeminiError, flashModels, geminiStream, isGeminiKey } from './gemini'

export const provider = (key = settings.get().apiKey): 'gemini' | 'claude' => (isGeminiKey(key) ? 'gemini' : 'claude')

export type Msg = BetaMessageParam

export class AiError extends Error {
  constructor(public code: 'nokey' | 'key' | 'busy' | 'offline' | 'refused' | 'other', msg: string) { super(msg) }
}

// The SDK loads only when the AI is first needed, so the app opens instantly.
let sdk: Promise<typeof import('@anthropic-ai/sdk')> | null = null
export const loadSdk = () => (sdk ??= import('@anthropic-ai/sdk'))

async function client(key?: string): Promise<Anthropic> {
  const k = key ?? settings.get().apiKey
  if (!k) throw new AiError('nokey', 'Add your AI key in Settings.')
  const { default: Anthropic } = await loadSdk()
  return new Anthropic({ apiKey: k, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90_000 })
}

async function toAiError(e: unknown): Promise<AiError> {
  if (e instanceof AiError) return e
  const { default: A } = await loadSdk()
  if (e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) return new AiError('key', 'Claude refused the API key. Check it in Settings.')
  if (e instanceof A.RateLimitError) return new AiError('busy', 'Claude is busy (rate limit). Try again in a minute.')
  if (e instanceof A.APIConnectionTimeoutError) return new AiError('offline', 'Claude took too long to answer. Check the connection.')
  if (e instanceof A.APIConnectionError) return new AiError('offline', 'No connection to Claude. Check the internet.')
  if (e instanceof A.APIUserAbortError) return new AiError('other', 'Stopped.')
  if (e instanceof A.InternalServerError) return new AiError('busy', 'Claude is overloaded right now. Try again in a minute.')
  if (e instanceof A.APIError) return new AiError('other', `Claude error ${e.status ?? ''}`.trim())
  return new AiError('other', e instanceof Error ? e.message : 'Something went wrong.')
}

/** Is it the "request shape not accepted" kind of error (a 400)? */
async function isBadRequest(e: unknown) {
  const { default: A } = await loadSdk()
  return e instanceof A.BadRequestError
}

export interface CallOpts {
  /** Stable instructions first (cached), then the per-session block (cached too). */
  system: string[]
  messages: Msg[]
  maxTokens: number
  kind: Usage['kind']
  session?: string
  onText?: (delta: string) => void
  signal?: AbortSignal
  effort?: 'low' | 'medium'
  /** The answer is JSON only (grading): Gemini is told so, Claude follows the prompt. */
  json?: boolean
}

export interface CallResult { text: string; content: BetaContentBlock[]; stop: string | null }

/**
 * One streamed request. Prompt caching: a breakpoint after each system block, plus the API's
 * automatic breakpoint on the growing conversation, so each turn pays full price only for
 * what's new. If the API ever rejects this request shape (a 400), the plainest form is used
 * from then on (no beta features), so the app keeps working.
 */
export async function call(o: CallOpts): Promise<CallResult> {
  if (!settings.get().apiKey) throw new AiError('nokey', 'Add your AI key in Settings.')
  if (provider() === 'gemini') return callGemini(o)
  const c = await client()
  const plain = !!settings.get().plainRequests
  try {
    return await run(c, o, plain)
  } catch (e) {
    if (!plain && (await isBadRequest(e))) {
      try {
        const r = await run(c, o, true)
        setSettings({ plainRequests: true })
        return r
      } catch (e2) { throw await toAiError(e2) }
    }
    throw await toAiError(e)
  }
}

async function run(c: Anthropic, o: CallOpts, plain: boolean): Promise<CallResult> {
  const system: BetaTextBlockParam[] = o.system.map((text) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } }))
  const messages = plain ? flattenSystem(o.messages) : o.messages
  const params = {
    model: MODEL,
    max_tokens: o.maxTokens,
    system,
    messages,
    // Quick replies matter in a spoken conversation: short thinking.
    thinking: { type: 'adaptive' as const },
    output_config: { effort: o.effort ?? 'low' },
    ...(plain ? {} : {
      cache_control: { type: 'ephemeral' as const },
      // If Claude declines a turn, the API retries it on a fallback model by itself.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    }),
  }
  const stream = c.beta.messages.stream(params, { signal: o.signal })
  if (o.onText) stream.on('text', (d: string) => o.onText!(d))
  const msg = await stream.finalMessage()
  const u = msg.usage
  const tokens = { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 }
  addUsage({ id: uid(), at: Date.now(), session: o.session, kind: o.kind, model: msg.model, ...tokens, usd: usd(msg.model, tokens) })
  if (msg.stop_reason === 'refusal') throw new AiError('refused', 'Claude declined to answer that turn.')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  return { text, content: msg.content, stop: msg.stop_reason }
}

/** The plain form: app messages folded into the learner's turn as [bracketed] text. */
export function flattenSystem(list: Msg[]): Msg[] {
  const out: Msg[] = []
  for (const m of list) {
    if (m.role !== 'system') { out.push(m); continue }
    const text = typeof m.content === 'string' ? m.content : (m.content ?? []).map((b) => ('text' in b ? b.text : '')).join(' ')
    const prev = out[out.length - 1]
    if (prev && prev.role === 'user') {
      const blocks = typeof prev.content === 'string' ? [{ type: 'text' as const, text: prev.content }] : [...prev.content]
      out[out.length - 1] = { role: 'user', content: [...blocks, { type: 'text', text: `[App: ${text}]` }] }
    } else out.push({ role: 'user', content: `[App: ${text}]` })
  }
  return out
}

/**
 * Gemini: same request, in Gemini's shape. App messages are folded into the learner's turn;
 * Gemini caches repeated prompts by itself (no setting needed). The free tier costs nothing.
 */
async function callGemini(o: CallOpts): Promise<CallResult> {
  const msgs = flattenSystem(o.messages).map((m) => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    text: typeof m.content === 'string' ? m.content : (m.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('\n'),
  })).filter((m) => m.text)
  try {
    const r = await geminiStream(settings.get().apiKey!, o.system.join('\n\n'), msgs, { maxTokens: o.maxTokens, effort: o.effort ?? 'low', json: o.json, onDelta: (d) => o.onText?.(d), signal: o.signal })
    addUsage({ id: uid(), at: Date.now(), session: o.session, kind: o.kind, model: r.model, input: r.input - r.cached, cacheWrite: 0, cacheRead: r.cached, output: r.output, usd: 0 })
    return { text: r.text, content: [{ type: 'text', text: r.text, citations: null }] as unknown as BetaContentBlock[], stop: 'end_turn' }
  } catch (e) { throw geminiError(e) }
}

function geminiError(e: unknown): AiError {
  if (e instanceof AiError) return e
  if (e instanceof GeminiError) {
    if (e.status === 400 || e.status === 403) return new AiError('key', e.message)
    if (e.status === 429 || e.status >= 500) return new AiError('busy', e.message)
    if (e.status === 0 && /internet|connection/i.test(e.message)) return new AiError('offline', e.message)
    return new AiError('other', e.message)
  }
  return new AiError('other', e instanceof Error ? e.message : 'Something went wrong.')
}

/** Checks a key without spending anything (lists the models it can use). */
export async function checkKey(key: string): Promise<string | undefined> {
  if (isGeminiKey(key)) {
    try {
      const list = await flashModels(key)
      if (!list.length) throw new AiError('key', 'No Gemini Flash model is available for this key.')
      return list[0]
    } catch (e) { throw geminiError(e) }
  }
  try {
    const c = await client(key)
    await c.models.retrieve(MODEL)
  } catch (e) { throw await toAiError(e) }
}
