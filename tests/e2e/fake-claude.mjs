// A stand-in for api.anthropic.com: answers like the tutor would, streamed the same way (SSE).
// Every request body is kept so tests can check what was sent (caching, app messages…).

const notes = (m = [], extra = {}) => `<notes>${JSON.stringify({ m, struggle: false, done: false, new: [], ...extra })}</notes>`

export function tutorReply(body) {
  const sys = (body.system || []).map((b) => b.text).join('\n')
  if (sys.startsWith('You are a Spanish placement examiner')) {
    const msgs0 = body.messages || []
    const u = typeof msgs0[0].content === 'string' ? msgs0[0].content : msgs0[0].content.map((b) => b.text).join('')
    const ids = [...u.matchAll(/id "(\w+)"/g)].map((m) => m[1])
    const part = Number(/Part (\d)/.exec(u)[1])
    return JSON.stringify({
      items: ids.map((id) => ({ id, score: part === 3 ? 0.3 : 0.8, issues: id.startsWith('s') ? ['verb'] : [], fix: 'Fui al mercado.' })),
      note: `Part ${part} note.`,
      cards: part === 2 ? [{ cue: 'How do you say: I went to the market?', answer: 'Fui al mercado.', alts: [], t: 'verb' }] : [],
    })
  }
  const msgs = body.messages || []
  const text = (m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((b) => b.text || '').join(' '))
  const all = msgs.map(text).join('\n')
  const last = [...msgs].reverse().find((m) => m.role === 'user')
  const said = last ? text(last) : ''
  if (/end-of-session recap|The session is over/.test(all.slice(-3000)) && /\[The session is over\.\]/.test(said + all.slice(-3000))) {
    return '<recap>{"fixes":[{"t":"verb","said":"Ayer yo va al mercado","fix":"Ayer fui al mercado","why":"ir in the past: yo fui"},{"t":"french","said":"nager","fix":"nadar","why":"French nager → nadar"},{"t":"listening","said":"Sí","fix":"¿Qué va a hacer?","why":"What are you going to do?"}],"cards":[{"cue":"How do you say: Yesterday I went to the market?","answer":"Ayer fui al mercado.","alts":[],"t":"verb"},{"cue":"How do you say: to swim?","answer":"nadar","alts":[],"t":"french"},{"cue":"How do you say: the faucet (Mexico)?","answer":"la llave","alts":[],"t":"vocab"}],"words":[{"es":"la llave","en":"the faucet"}],"level":"A2-","note_en":"You kept the conversation going well; work on the past tense of ir.","note_es":"¡Muy bien! Practique el pasado de ir."}</recap>'
  }
  if (/Start the scene now/.test(said)) return `<say>¡Buenos días! ¿Qué limpio primero hoy, la cocina o el baño?</say>${notes()}`
  if (/en ingl[eé]s/i.test(said)) return `<say lang="en">I asked what you did yesterday.</say><say>¿Qué hizo ayer?</say>${notes()}`
  if (/yo va/i.test(said)) return `<say>¿Ayer fue al mercado? ¡Qué bien! ¿Qué compró?</say>${notes([{ t: 'verb', said: 'Ayer yo va al mercado', fix: 'Ayer fui al mercado', why: 'ir in the past: yo fui', big: true, ask: false }], { new: [{ es: 'la llave', en: 'the faucet' }] })}`
  if (/nager/i.test(said)) return `<say>¿Cómo se dice "nager" en español?</say>${notes([{ t: 'french', said: 'nager', fix: 'nadar', why: 'French nager → nadar', big: true, ask: true }])}`
  return `<say>Muy bien. ¿Y después qué hago?</say>${notes()}`
}

export function sse(text, model = 'claude-sonnet-5-5') {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  let out = ev('message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 40, cache_creation_input_tokens: 2800, cache_read_input_tokens: 0, output_tokens: 1 } } })
  out += ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
  for (let i = 0; i < text.length; i += 12) out += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 12) } })
  out += ev('content_block_stop', { index: 0 })
  out += ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.ceil(text.length / 3) } })
  out += ev('message_stop', {})
  return out
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }

/** Routes the page's Claude calls to the fake. Returns the list of request bodies. */
export async function fakeClaude(page, opts = {}) {
  const calls = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(req.url())
    calls.push({ path: url.pathname, headers: req.headers(), body: req.postDataJSON?.() ?? null })
    if (page.claudeFailNext && url.pathname === '/v1/messages') { page.claudeFailNext = false; return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'temporarily refused' } }) }) }
    if (opts.fail) return route.fulfill({ status: opts.fail, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) })
    if (url.pathname.startsWith('/v1/models/')) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'claude-sonnet-5-5', type: 'model', display_name: 'Claude Sonnet 5.5', created_at: '2026-10-01T00:00:00Z' }) })
    const body = req.postDataJSON()
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(tutorReply(body)) })
  })
  // Gemini (generativelanguage.googleapis.com): the same tutor, in Gemini's shape.
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(req.url())
    calls.push({ path: url.pathname, headers: req.headers(), body: req.postDataJSON?.() ?? null, gemini: true })
    if (req.headers()['x-goog-api-key'] === 'AIzaBADBADBADBADBADBADBADBAD') return route.fulfill({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }) })
    if (url.pathname === '/v1beta/models') return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] }] }) })
    const b = req.postDataJSON()
    const body = {
      system: [{ text: b.systemInstruction.parts.map((x) => x.text).join('') }],
      messages: b.contents.map((c) => ({ role: c.role === 'model' ? 'assistant' : 'user', content: c.parts.map((x) => x.text).join('') })),
    }
    const text = tutorReply(body)
    let out = ''
    for (let i = 0; i < text.length; i += 15) out += `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: text.slice(i, i + 15) }] } }] })}\r\n\r\n`
    out += `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2500, cachedContentTokenCount: 2000, candidatesTokenCount: 60 } })}\r\n\r\n`
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: out })
  })
  return calls
}
