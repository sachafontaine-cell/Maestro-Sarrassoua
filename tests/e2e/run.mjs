// End-to-end tests on an emulated Pixel 7 (Chrome): first run, a whole tap-to-talk session with
// voice commands, hands-free, a blocked microphone, the placement test, backup, offline start
// and dark mode. The microphone, the voice and Claude are faked (see fakes.js, fake-claude.mjs).
// Run: npm run e2e   (builds first). Needs Playwright's Chromium.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { serve } from './serve.mjs'
import { fakeClaude } from './fake-claude.mjs'
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const BASE = 'http://localhost:4321/Maestro-Sarrassoua/'
const SHOTS = 'tests/e2e/shots'
mkdirSync(SHOTS, { recursive: true })
const FAKES = readFileSync(new URL('./fakes.js', import.meta.url), 'utf8')
const results = []
const only = process.argv[2]
async function test(name, fn) {
  if (only && !name.includes(only)) return
  const t0 = Date.now()
  try { await fn(); results.push(['PASS', name, Date.now() - t0]) } catch (e) { if (process.env.STACK) console.log(e.stack); results.push(['FAIL', name, e.message.split('\n')[0]]) }
}
const expect = (ok, msg) => { if (!ok) throw new Error(msg) }

const srv = await serve()
const browser = await chromium.launch()
const PIXEL = devices['Pixel 7']

async function page(opts = {}) {
  const ctx = await browser.newContext({ ...PIXEL, serviceWorkers: 'block', ...opts })
  await ctx.addInitScript(FAKES)
  const p = await ctx.newPage()
  p.errors = []
  p.on('pageerror', (e) => p.errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()) })
  p.calls = await fakeClaude(p, opts.claude)
  return p
}
const text = (p) => p.evaluate(() => document.body.innerText)
const spoken = (p) => p.evaluate(() => window.__spoken.map((s) => s.text))
const say = (p, t) => p.evaluate((x) => window.__say(x), t)
const posts = (p) => p.calls.filter((c) => c.path === '/v1/messages')
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` })

async function addKey(p) {
  await p.goto(BASE + '#/settings/key')
  await p.getByRole('textbox', { name: 'API key' }).fill('sk-ant-test-0000')
  await p.getByRole('button', { name: 'Save' }).click()
  await p.getByText('Key checked and saved on this phone.').waitFor()
}
/** Tap the mic, say it, tap again to send. */
async function speakTurn(p, t) {
  const mic = p.getByRole('button', { name: 'Speak', exact: true })
  await mic.waitFor()
  await p.waitForFunction(() => !document.querySelector('.mic').disabled)
  await mic.click()
  await p.getByRole('button', { name: 'Stop and send' }).waitFor()
  await say(p, t)
  await p.waitForTimeout(150)
  await p.getByRole('button', { name: 'Stop and send' }).click()
}
const waitSpoken = (p, re) => p.waitForFunction((src) => window.__spoken.some((s) => new RegExp(src).test(s.text)), re.source, { timeout: 8000 })

const SEED_ANSWERS = {
  'I’m going to clean the kitchen.': 'Voy a limpiar la cocina',
  'What are you going to do tomorrow? (usted)': 'Qué va a hacer mañana',
  'Yesterday I went to the market.': 'Ayer fui al mercado',
  'to swim': 'nadar',
  'over there': 'allá',
  'Please clean the bathroom. (usted)': 'Limpie el baño por favor',
  'We eat at eight.': 'Comemos a las ocho',
  'What did you do yesterday? (usted)': 'Qué hizo ayer',
}

// ---------- First run and a whole session ----------

await test('first run: Home asks for the key; the button leads to Settings → key, the key is checked', async () => {
  const p = await page()
  await p.goto(BASE)
  await p.getByRole('heading', { name: 'Hablemos' }).waitFor()
  const t = await text(p)
  expect(t.includes('0 days'), 'streak shown')
  expect(/Today · Stage 1/i.test(t), 'today card')
  expect(t.includes('Rosa · Mexico City'), 'persona')
  await shot(p, '0-first-run')
  await p.getByRole('button', { name: 'Add your Claude API key' }).click()
  await p.getByText('1 thing to set up').waitFor()
  expect(p.url().includes('#/settings/key'), 'went to the key section')
  await p.getByRole('textbox', { name: 'API key' }).fill('not-a-key')
  await p.getByRole('button', { name: 'Save' }).click()
  await p.getByText(/doesn’t look like a Claude API key/).waitFor()
  await p.getByRole('textbox', { name: 'API key' }).fill('sk-ant-test-0000')
  await p.getByRole('button', { name: 'Save' }).click()
  await p.getByText('Key checked and saved on this phone.').waitFor()
  expect(p.calls.some((c) => c.path === '/v1/models/claude-sonnet-5-5'), 'key checked against the model (free)')
  const h = p.calls[0].headers
  expect((h['x-api-key'] === 'sk-ant-test-0000' || h.authorization === 'Bearer sk-ant-test-0000') && h['anthropic-dangerous-direct-browser-access'] === 'true', 'browser access header sent: ' + JSON.stringify(Object.keys(h)))
  await p.getByText('Ready', { exact: true }).waitFor()
  // Kept on the phone (IndexedDB), not in localStorage.
  await p.reload()
  await p.getByText('Key saved').waitFor()
  expect(await p.evaluate(() => localStorage.length) === 0, 'nothing in localStorage')
  expect(p.errors.length === 0, 'no console errors: ' + p.errors.join(' | '))
  await p.context().close()
})

await test('session (tap-to-talk): review by voice, role-play with a correction card, voice commands, recap', async () => {
  const p = await page()
  await addKey(p)
  await p.goto(BASE)
  await p.getByRole('button', { name: 'Start today’s session' }).click()
  // 1. Review: the English cue is spoken; answer out loud.
  await p.getByText('Quick review · 1 of 8').waitFor()
  const cue = (await p.locator('.cue').innerText()).trim()
  await waitSpoken(p, /How do you say/)
  await speakTurn(p, SEED_ANSWERS[cue] ?? 'no sé')
  await p.getByText('¡Muy bien!', { exact: true }).waitFor()
  await shot(p, '1-review')
  // Second item: "repite" repeats the cue; then skip to the conversation.
  await p.getByText('Quick review · 2 of 8').waitFor()
  await p.waitForFunction(() => !document.querySelector('.mic').disabled)
  const before = (await spoken(p)).filter((s) => /How do you say/.test(s)).length
  await speakTurn(p, 'repite')
  await p.waitForFunction((n) => window.__spoken.filter((s) => /How do you say/.test(s.text)).length > n, before)
  await p.getByRole('button', { name: 'Skip to the conversation' }).click()
  // 2. Role-play: the tutor opens and speaks.
  await p.getByText('¿Qué limpio primero hoy, la cocina o el baño?').waitFor()
  await waitSpoken(p, /Qué limpio primero/)
  const first = posts(p)[0].body
  expect(first.model === 'claude-sonnet-5-5', 'model is Sonnet 5.5: ' + first.model)
  expect(first.system.length === 2 && first.system.every((b) => b.cache_control?.type === 'ephemeral'), 'both system blocks cached')
  expect(first.cache_control?.type === 'ephemeral', 'conversation tail cached')
  expect(first.system[1].text.includes('ROSA') && first.system[1].text.includes('usted'), 'Rosa, usted')
  expect(first.stream === true, 'streamed')
  // A big mistake: the written correction appears under what I said.
  await speakTurn(p, 'Ayer yo va al mercado')
  await p.getByText('Ayer fui al mercado', { exact: true }).waitFor()
  await p.getByText(/Verb forms · ir in the past/).waitFor()
  expect(posts(p)[1].body.system[0].text === first.system[0].text, 'the tutor prompt is byte-identical (cache hit)')
  await shot(p, '2-talk-correction')
  // "repite": no new request, the last line is spoken again.
  const n = posts(p).length
  await p.waitForFunction(() => !document.querySelector('.mic').disabled)
  const times = (await spoken(p)).filter((s) => /Qué compró/.test(s)).length
  await speakTurn(p, 'Repite, por favor')
  await p.waitForFunction((k) => window.__spoken.filter((s) => /Qué compró/.test(s.text)).length > k, times)
  expect(posts(p).length === n, 'repite costs nothing')
  // "más despacio": slower voice (the same setting as Settings), and repeated.
  await speakTurn(p, 'más despacio')
  await p.waitForFunction((k) => window.__spoken.filter((s) => /Qué compró/.test(s.text)).length > k + 1, times)
  // "en inglés": an English explanation, spoken with the English voice.
  await speakTurn(p, 'en inglés')
  await p.getByText('I asked what you did yesterday.').waitFor()
  const eng = await p.evaluate(() => window.__spoken.find((s) => s.text === 'I asked what you did yesterday.'))
  expect(eng && eng.lang === 'en-US', 'English voice: ' + JSON.stringify(eng))
  const engReq = posts(p)[posts(p).length - 1].body.messages
  expect(engReq[engReq.length - 1].role === 'system' && /en inglés/.test(engReq[engReq.length - 1].content), 'app instruction sent as a system message')
  // Typing works too.
  await p.getByRole('button', { name: 'Type instead' }).click()
  await p.getByLabel('Type your answer').fill('Limpie la cocina, por favor')
  await p.getByRole('button', { name: 'Send' }).click()
  await p.getByText('Muy bien. ¿Y después qué hago?').waitFor()
  await p.getByRole('button', { name: 'Speak instead' }).click()
  // "terminar": the recap, written and read aloud, added to the review list.
  await speakTurn(p, 'terminar')
  await p.getByRole('heading', { name: 'Recap' }).waitFor()
  await p.getByText('Ayer fui al mercado').first().waitFor()
  await p.getByText('Your top 3 fixes').waitFor()
  await p.getByRole('button', { name: 'Done' }).waitFor({ timeout: 10000 })
  const recapReq = posts(p)[posts(p).length - 1].body
  expect(recapReq.system[0].text === first.system[0].text && recapReq.system[1].text === first.system[1].text, 'the recap reuses the cached prompt')
  expect((await spoken(p)).includes('Ayer fui al mercado'), 'fixes read aloud')
  await p.getByText(/3 added to your review list/).waitFor()
  await shot(p, '3-recap')
  await p.getByRole('button', { name: 'Done' }).click()
  // Home: streak, done today.
  await p.getByText('1 day').waitFor()
  await p.getByText(/Done today/i).waitFor()
  await p.getByRole('button', { name: 'Practice again' }).waitFor()
  // Progress: mistakes by type and the session in the history.
  await p.getByRole('button', { name: 'Progress' }).click()
  await p.getByRole('heading', { name: 'Progress' }).waitFor()
  await p.getByText(/Sessions · 1 finished/i).waitFor()
  const prog = await text(p)
  expect(/Verb forms\s*\n?\s*1/.test(prog), 'verb mistake counted')
  await shot(p, '4-progress')
  await p.locator('.hist').first().click()
  await p.getByRole('dialog').getByText('Ayer fui al mercado').waitFor()
  await p.waitForTimeout(300)
  await shot(p, '4-progress-history')
  await p.keyboard.press('Escape')
  // Settings: the speed went down by "más despacio" (0.90 → 0.80), the cost is shown.
  await p.getByRole('button', { name: 'Settings' }).click()
  await p.getByText('0.80×').waitFor()
  const cost = await text(p)
  expect(/Last session\s*\n?\s*\$0\.\d\d|<\$0\.01/.test(cost), 'session cost shown')
  expect(/This month/.test(cost), 'monthly cost shown')
  expect(p.errors.length === 0, 'no console errors: ' + p.errors.join(' | '))
  await p.context().close()
})

await test('hands-free: big buttons only, listens by itself, nothing written until the recap', async () => {
  const p = await page()
  await addKey(p)
  await p.getByRole('switch', { name: 'Hands-free by default' }).click()
  await p.locator('[role=switch][aria-checked=true]').waitFor()
  await p.waitForTimeout(300) // saved to the phone before the page reloads
  await p.goto(BASE)
  await p.getByRole('button', { name: 'Start today’s session' }).click()
  await p.getByRole('button', { name: 'Pause' }).waitFor()
  await p.getByRole('button', { name: 'Repeat' }).waitFor()
  await p.getByRole('button', { name: 'End' }).waitFor()
  // Review: the cue is spoken, then it listens by itself (no tap).
  await waitSpoken(p, /How do you say/)
  await p.waitForFunction(() => !!window.__stt.active)
  await shot(p, '5-hands-free')
  const words = (await text(p)).replace(/\s+/g, ' ')
  expect(!/How do you say/.test(words), 'nothing to read: ' + words)
  await say(p, 'terminar') // ends straight from the review
  await p.getByRole('heading', { name: 'Recap' }).waitFor({ timeout: 10000 })
  await p.getByRole('button', { name: 'Done' }).click()
  // Ended during the review: not a finished session, so Home still offers today's session.
  await p.getByRole('button', { name: 'Start today’s session' }).click()
  await p.getByRole('button', { name: 'Pause' }).waitFor()
  await waitSpoken(p, /How do you say/)
  // Skip the rest of the review from the screen view, then go back to hands-free.
  await p.getByRole('button', { name: 'Use the screen' }).click()
  await p.getByRole('button', { name: 'Skip to the conversation' }).click()
  await p.getByRole('button', { name: 'Switch to hands-free' }).click()
  await waitSpoken(p, /Qué limpio primero/)
  await p.waitForFunction(() => !!window.__stt.active) // listening by itself after the tutor
  await say(p, 'Ayer yo va al mercado')
  await waitSpoken(p, /Qué compró/)
  expect(!(await text(p)).includes('Ayer fui al mercado'), 'no written correction in hands-free')
  // Repeat button.
  await p.waitForFunction(() => !!window.__stt.active)
  const k = (await spoken(p)).filter((s) => /Qué compró/.test(s)).length
  await p.getByRole('button', { name: 'Repeat' }).click()
  await p.waitForFunction((x) => window.__spoken.filter((s) => /Qué compró/.test(s.text)).length > x, k)
  // Pause / Resume.
  await p.getByRole('button', { name: 'Pause' }).click()
  await p.getByRole('button', { name: 'Resume' }).waitFor()
  await p.getByRole('button', { name: 'Resume' }).click()
  await p.waitForFunction(() => !!window.__stt.active)
  await say(p, 'terminar')
  await waitSpoken(p, /Your top 3 fixes/)
  await p.getByRole('button', { name: 'Done' }).waitFor({ timeout: 10000 })
  await p.getByText('Ayer fui al mercado').first().waitFor() // written in the recap
  const hf = posts(p).find((c) => c.body.messages.some((m) => m.role === 'system' && /HANDS-FREE/.test(m.content)))
  expect(!!hf, 'the tutor knows it is hands-free')
  expect(p.errors.length === 0, 'no console errors: ' + p.errors.join(' | '))
  await p.context().close()
})

await test('microphone blocked: clear help, and typing still works', async () => {
  const p = await page()
  await addKey(p)
  await p.evaluate(() => { window.__stt.denied = true })
  await p.goto(BASE)
  await p.evaluate(() => { window.__stt.denied = true })
  await p.getByRole('button', { name: 'Start today’s session' }).click()
  await p.getByRole('button', { name: 'Skip to the conversation' }).click()
  await p.getByText('¿Qué limpio primero hoy, la cocina o el baño?').waitFor()
  await p.waitForFunction(() => !document.querySelector('.mic').disabled)
  await p.getByRole('button', { name: 'Speak', exact: true }).click()
  await p.getByText('The microphone is blocked').waitFor()
  await p.getByText(/Permissions → Microphone → Allow/).waitFor()
  await shot(p, '6-mic-blocked')
  await p.getByRole('button', { name: 'Type instead' }).click()
  await p.getByLabel('Type your answer').fill('La cocina primero')
  await p.getByRole('button', { name: 'Send' }).click()
  await p.getByText('Muy bien. ¿Y después qué hago?').waitFor()
  await p.context().close()
})

await test('wrong key: the session says so and points to Settings', async () => {
  const p = await page({ claude: { fail: 401 } })
  await p.goto(BASE + '#/settings/key')
  await p.getByRole('textbox', { name: 'API key' }).fill('sk-ant-wrong')
  await p.getByRole('button', { name: 'Save' }).click()
  await p.getByText(/refused the API key/).waitFor()
  await p.context().close()
})

await test('placement test: 12 spoken items, graded, level and focus updated', async () => {
  const p = await page()
  await addKey(p)
  await p.goto(BASE + '#/progress')
  await p.getByRole('button', { name: /Take the placement test/ }).click()
  await p.getByRole('button', { name: 'Start' }).click()
  for (let i = 0; i < 12; i++) {
    await p.getByText(`${i + 1} / 12`).waitFor()
    if (i === 0) { await p.getByRole('button', { name: 'Play again' }).click() }
    if (i === 2) { await p.getByRole('button', { name: 'Skip this one' }).click(); continue }
    await speakTurn(p, i % 2 ? 'Mañana voy a nadar en la playa' : 'Me llamo Sacha y soy de Francia')
  }
  await p.getByText('Your level').waitFor({ timeout: 10000 })
  await p.getByText('A2', { exact: true }).waitFor()
  const req = posts(p)[0].body
  expect(/placement examiner/.test(req.system[0].text), 'graded by the examiner prompt')
  const answers = req.messages[0].content
  expect(/replayed 1×/.test(answers) && /Answer: ""/.test(answers), 'replays and skips are reported')
  expect(req.output_config?.effort === 'medium', 'graded with more thinking')
  await shot(p, '7-placement')
  await p.getByRole('button', { name: 'Done' }).click()
  await p.getByText(/Placement test .*: A2\./).waitFor()
  await p.context().close()
})

await test('backup: export without the key, import restores', async () => {
  const p = await page()
  await addKey(p)
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export a backup (JSON)' }).click()])
  const file = await dl.path()
  const json = JSON.parse(readFileSync(file, 'utf8'))
  expect(json.app === 'hablemos' && json.cards.length === 8, 'backup has the review list')
  expect(!JSON.stringify(json).includes('sk-ant-test'), 'no key in the backup')
  p.on('dialog', (d) => d.accept())
  await p.locator('input[type=file]').setInputFiles(file)
  await p.getByText(/Restored: 0 sessions, 8 review items/).waitFor()
  await p.getByText('Key saved').waitFor()
  await p.context().close()
})

await test('stage switch lives in Progress; Home follows; Settings region changes Catalina', async () => {
  const p = await page()
  await addKey(p)
  await p.getByLabel("Catalina's region").selectOption('medellin')
  await p.waitForTimeout(300)
  await p.goto(BASE + '#/progress')
  await p.getByText(/Stage 2 unlocks when you/).waitFor()
  await p.getByRole('button', { name: 'Stage 2 · locked' }).click()
  await p.getByRole('button', { name: 'Home' }).click()
  await p.getByText('Catalina · Medellín').waitFor()
  await p.getByText(/Today · Stage 2/i).waitFor()
  await p.getByRole('button', { name: 'Change' }).click()
  await p.getByRole('dialog', { name: 'Today’s scenario' }).getByText('A phone call at real speed').click()
  await p.getByRole('heading', { name: 'A phone call at real speed' }).waitFor()
  await p.getByRole('button', { name: 'Start today’s session' }).click()
  await p.getByRole('button', { name: 'Skip to the conversation' }).click()
  await p.getByText(/Phone call: listen first/).waitFor() // no words on screen for the call
  const sys = posts(p)[0].body.system[1].text
  expect(sys.includes('CATALINA') && sys.includes('Medellín') && sys.includes('PHONE CALL'), 'Catalina from Medellín, on the phone')
  await shot(p, '8-stage2-phone')
  await p.context().close()
})

await test('offline: the app opens with no connection once installed', async () => {
  const ctx = await browser.newContext({ ...PIXEL })
  const p = await ctx.newPage()
  await p.goto(BASE)
  await p.getByRole('heading', { name: 'Hablemos' }).waitFor()
  await p.evaluate(() => navigator.serviceWorker.ready)
  await p.reload()
  await p.waitForFunction(() => !!navigator.serviceWorker.controller)
  await ctx.setOffline(true)
  await p.reload()
  await p.getByRole('heading', { name: 'Hablemos' }).waitFor()
  await ctx.close()
})

await test('dark mode and speed: Home draws fast', async () => {
  const p = await page({ colorScheme: 'dark' })
  const t0 = Date.now()
  await p.goto(BASE)
  await p.getByRole('button', { name: 'Add your Claude API key' }).waitFor()
  const ms = Date.now() - t0
  expect(ms < 2500, `Home in ${ms} ms`)
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg === 'rgb(14, 23, 41)', 'dark background: ' + bg)
  await shot(p, '9-dark')
  await p.context().close()
})

await browser.close()
srv.close()
for (const [r, n, d] of results) console.log(`${r === 'PASS' ? '✓' : '✗'} ${n}${r === 'PASS' ? ` (${d} ms)` : `\n    → ${d}`}`)
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
