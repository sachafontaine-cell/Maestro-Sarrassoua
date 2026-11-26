// Settings: API key, voice and speed, accents, hands-free default, backup, and cost.
// Each of these is changed here and nowhere else.
import { useEffect, useState } from 'preact/hooks'
import { settings, setSettings, usage, sessions } from '../lib/data'
import { checkKey, AiError, provider } from '../lib/ai'
import { isGeminiKey } from '../lib/gemini'
import { REGIONS } from '../lib/curriculum'
import type { RegionId } from '../lib/model'
import { route } from '../lib/nav'
import { bestVoice, canListen, listen, loadVoices, speakOne, voicesFor, MicError, type VoiceLang } from '../lib/speech'
import { sayOpts } from '../lib/voice'
import { RATE_MAX, RATE_MIN, RATE_STEP, clampRate } from '../lib/commands'
import { money, totals, MODEL } from '../lib/cost'
import { live } from '../lib/session'
import { backupName, makeBackup, readBackup, restoreBackup } from '../lib/backup'
import { checkForUpdate, updateNow } from '../lib/update'
import { Fleur, Icon, Spinner, Switch } from '../ui'

const AI_STUDIO = 'https://aistudio.google.com/apikey'
const CONSOLE = 'https://console.anthropic.com/settings/keys'

export function Settings() {
  const s = settings.use()
  const r = route.use()
  useEffect(() => { if (r.section) document.getElementById(r.section)?.scrollIntoView({ block: 'start' }) }, [r.section])
  return (
    <main class="main">
      <h1 class="h1">Settings</h1>
      <div class={`setstatus ${s.apiKey ? 'ok' : 'todo'}`} role="status">
        <b>{s.apiKey ? <><Icon.check />Ready</> : '1 thing to set up'}</b>
        <span>{s.apiKey ? 'Your tutor is set up on this phone.' : 'Add your AI key below.'}</span>
      </div>
      <KeySection />
      <VoiceSection />
      <AccentSection />
      <BackupSection />
      <CostSection />
      <About />
    </main>
  )
}

function KeySection() {
  const s = settings.use()
  const [key, setKey] = useState('')
  const [st, setSt] = useState<{ busy?: boolean; err?: string; ok?: string }>({})
  const [change, setChange] = useState(!s.apiKey)
  const save = async (raw: string) => {
    const k = raw.trim()
    if (!k) return
    if (!isGeminiKey(k) && !/^sk-ant-/.test(k)) { setSt({ err: 'That doesn’t look like a Gemini key (starts with AIza) or a Claude key (starts with sk-ant-).' }); return }
    setSt({ busy: true })
    try {
      const model = await checkKey(k)
      setSettings({ apiKey: k, geminiModel: model })
      setKey(''); setChange(false); setSt({ ok: 'Key checked and saved on this phone.' })
    } catch (e) {
      if (e instanceof AiError && (e.code === 'offline' || e.code === 'busy')) {
        setSettings({ apiKey: k }); setKey(''); setChange(false); setSt({ ok: 'Key saved. It will be checked on first use.' })
      } else setSt({ err: e instanceof Error ? e.message : 'Could not check the key.' })
    }
  }
  const paste = async () => {
    try { const t = (await navigator.clipboard.readText()).trim(); if (t) { setKey(t); void save(t) } else setSt({ err: 'The clipboard is empty: copy the key first.' }) } catch { setSt({ err: 'Paste was blocked: long-press the box below and paste.' }) }
  }
  return (
    <section class="section" id="key" aria-label="AI key">
      <span class="label">AI key</span>
      <div class="card card-pad stack">
        {!change && s.apiKey ? (
          <>
            <div class="between"><span class="chip ok"><Icon.check />{provider(s.apiKey) === 'gemini' ? 'Gemini' : 'Claude'} key saved</span><span class="muted num">…{s.apiKey.slice(-4)}</span></div>
            {st.ok && <p class="muted">{st.ok}</p>}
            <div class="row">
              <button class="btn btn-quiet btn-sm grow press" onClick={() => { setChange(true); setSt({}) }}>Change</button>
              <button class="btn btn-danger btn-sm grow press" onClick={() => { if (confirm('Remove the key from this phone?')) { setSettings({ apiKey: undefined }); setChange(true); setSt({}) } }}>Remove</button>
            </div>
          </>
        ) : (
          <>
            <ol class="muted" style={{ margin: 0, paddingLeft: '20px' }}>
              <li>In Google AI Studio: <b>Create API key</b> → <b>Create in new project</b>. Copy it.</li>
              <li>Come back and tap <b>Paste key</b>.</li>
            </ol>
            <a class="btn btn-secondary press" href={AI_STUDIO} target="_blank" rel="noopener">Get a free Gemini key<Icon.out /></a>
            {'clipboard' in navigator && <button class="btn btn-primary press" disabled={st.busy} onClick={paste}>{st.busy ? <Spinner /> : 'Paste key'}</button>}
            <form class="row" onSubmit={(e) => { e.preventDefault(); void save(key) }}>
              <input class="field grow" type="password" value={key} placeholder="AIza…" aria-label="API key" autoComplete="off" onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
              <button class="btn btn-quiet btn-sm press" type="submit" disabled={!key.trim() || st.busy}>Save</button>
            </form>
            {st.err && <p class="muted" style={{ color: 'var(--danger)' }} role="alert">{st.err}</p>}
            <p class="muted small">Prefer Claude (paid, about $3 a month)? Paste a Claude key from the <a href={CONSOLE} target="_blank" rel="noopener">Claude Console</a> instead.</p>
          </>
        )}
      </div>
      <p class="setnote">Stored only on this phone, sent only to {provider(s.apiKey) === 'gemini' ? 'Google' : 'Anthropic'}, never in backups. {provider(s.apiKey) === 'gemini' ? <>Free tier: never turn on billing in that Google project. Model: {s.geminiModel ?? 'Gemini Flash'}.</> : <>Model: {MODEL}.</>}</p>
    </section>
  )
}

function VoiceSection() {
  const s = settings.use()
  const [mic, setMic] = useState<{ busy?: boolean; heard?: string; err?: string }>({})
  const test = () => speakOne('Hola, ¿cómo está? Hoy vamos a practicar un poco.', sayOpts(1, 'es'))
  const testMic = async () => {
    setMic({ busy: true })
    const l = listen({ lang: 'es-MX', untilStopped: false, onInterim: (t) => setMic({ busy: true, heard: t }) })
    try { const t = await l.result; setMic({ heard: t || '(nothing heard)' }) } catch (e) { setMic({ err: e instanceof MicError && e.code === 'denied' ? 'Blocked. Chrome: tap the icon left of the address → Permissions → Microphone → Allow. Installed app: long-press the icon → App info → Permissions.' : e instanceof Error ? e.message : 'Microphone problem.' }) }
  }
  return (
    <section class="section" id="voice" aria-label="Voice">
      <span class="label">Voice</span>
      <div class="setgroup">
        <div class="setrow">
          <span class="grow"><b>Speaking speed</b><br /><span class="muted">“Más despacio” and “más rápido” change it too.</span></span>
          <div class="stepper">
            <button class="round press" aria-label="Slower" disabled={s.rate <= RATE_MIN} onClick={() => setSettings({ rate: clampRate(s.rate - RATE_STEP / 2) })}>−</button>
            <span class="stepper-value num" aria-live="polite">{s.rate.toFixed(2)}×</span>
            <button class="round press" aria-label="Faster" disabled={s.rate >= RATE_MAX} onClick={() => setSettings({ rate: clampRate(s.rate + RATE_STEP / 2) })}>+</button>
          </div>
        </div>
        <button class="setrow press" onClick={test}><Icon.speaker /><span class="grow">Hear the voice</span></button>
        <div class="setrow">
          <span class="grow"><b>Hands-free by default</b><br /><span class="muted">Listens by itself after the tutor speaks; big buttons, nothing to read. For driving and walks.</span></span>
          <Switch on={s.handsFreeDefault} label="Hands-free by default" onChange={(v) => setSettings({ handsFreeDefault: v })} />
        </div>
        <button class="setrow press" onClick={testMic} disabled={mic.busy || !canListen()}><Icon.mic /><span class="grow">Test the microphone</span>{mic.busy && <Spinner />}</button>
      </div>
      {!canListen() && <p class="setnote">Speech recognition isn’t available in this browser: use Chrome. You can still type.</p>}
      {mic.heard && <p class="setnote">Heard: “{mic.heard}”</p>}
      {mic.err && <p class="setnote" style={{ color: 'var(--danger)' }} role="alert">{mic.err}</p>}
    </section>
  )
}

function VoicePick({ label, want, value, onPick }: { label: string; want: VoiceLang; value?: string; onPick: (name?: string) => void }) {
  const [list, setList] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => { void loadVoices().then(() => setList(voicesFor(want))) }, [want])
  const best = bestVoice(want, undefined, list)
  return (
    <div class="setrow">
      <span class="grow"><b>{label}</b></span>
      <select class="field" style={{ width: '58%', height: '44px' }} aria-label={`${label} voice`} value={value ?? ''} onChange={(e) => onPick((e.target as HTMLSelectElement).value || undefined)}>
        <option value="">Best: {best ? `${best.name} (${best.lang})` : 'none found'}</option>
        {list.map((v) => <option value={v.name}>{v.name} ({v.lang})</option>)}
      </select>
    </div>
  )
}

function AccentSection() {
  const s = settings.use()
  return (
    <section class="section" id="accents" aria-label="Accents">
      <span class="label">Accents</span>
      <div class="setgroup">
        <div class="setrow"><span class="grow"><b>Stage 1 · Rosa</b><br /><span class="muted">Mexico City · listens in es-MX</span></span></div>
        <VoicePick label="Her voice" want="es-MX" value={s.voiceMx} onPick={(v) => setSettings({ voiceMx: v })} />
        <div class="setrow">
          <span class="grow"><b>Stage 2 · Catalina</b><br /><span class="muted">Colombia · listens in es-CO</span></span>
          <select class="field" style={{ width: '58%', height: '44px' }} aria-label="Catalina's region" value={s.region} onChange={(e) => setSettings({ region: (e.target as HTMLSelectElement).value as RegionId })}>
            {(Object.keys(REGIONS) as RegionId[]).map((k) => <option value={k}>{REGIONS[k].label}</option>)}
          </select>
        </div>
        <VoicePick label="Her voice" want="es-CO" value={s.voiceCo} onPick={(v) => setSettings({ voiceCo: v })} />
        <VoicePick label="English voice" want="en-US" value={s.voiceEn} onPick={(v) => setSettings({ voiceEn: v })} />
      </div>
      <p class="setnote">The region changes Catalina’s expressions. Phones rarely have a Colombian voice: the closest Latin American one is used. More voices: Android Settings → Text-to-speech → Google → Install voice data → Spanish.</p>
    </section>
  )
}

function BackupSection() {
  const [msg, setMsg] = useState('')
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = backupName()
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    setMsg('Backup saved to Downloads.')
  }
  const importIt = async (f: File | undefined) => {
    if (!f) return
    try {
      const r = readBackup(JSON.parse(await f.text()))
      if (!r.ok) { setMsg(r.why); return }
      if (!confirm(`Replace everything on this phone with the backup from ${r.data.at.slice(0, 10)}? (Your API key stays.)`)) return
      await restoreBackup(r.data)
      setMsg(`Restored: ${r.data.sessions.length} sessions, ${r.data.cards.length} review items.`)
    } catch { setMsg('That file can’t be read.') }
  }
  return (
    <section class="section" id="backup" aria-label="Backup">
      <span class="label">Backup</span>
      <div class="setgroup">
        <button class="setrow press" onClick={exportIt}><Icon.download /><span class="grow">Export a backup (JSON)</span></button>
        <label class="setrow press" style={{ cursor: 'pointer' }}>
          <Icon.upload /><span class="grow">Import a backup</span>
          <input type="file" accept="application/json,.json" class="sr" onChange={(e) => { const i = e.target as HTMLInputElement; void importIt(i.files?.[0]); i.value = '' }} />
        </label>
      </div>
      <p class="setnote">{msg || 'Everything lives on this phone only. The API key is never in a backup.'}</p>
    </section>
  )
}

function CostSection() {
  const u = usage.use()
  const ss = sessions.use()
  const l = live.use()
  const t = totals(u, Date.now())
  const lastId = l?.id ?? Object.values(ss).sort((a, b) => b.at - a.at)[0]?.id
  return (
    <section class="section" id="cost" aria-label="Cost">
      <span class="label">Cost (estimate)</span>
      <div class="setgroup">
        <div class="setrow"><span class="grow">{l ? 'This session' : 'Last session'}</span><span class="setval num">{lastId ? money(t.perSession(lastId)) : '–'}</span></div>
        <div class="setrow"><span class="grow">This month</span><span class="setval num">{money(t.thisMonth)}</span></div>
        <div class="setrow"><span class="grow">Average per session</span><span class="setval num">{money(t.avgSession)}</span></div>
        <div class="setrow"><span class="grow">Since the start</span><span class="setval num">{money(t.allTime)}</span></div>
      </div>
      <p class="setnote">{provider() === 'gemini'
        ? 'Gemini free tier: $0. (Earlier Claude sessions, if any, are counted above.) If Gemini says the free limit is reached, wait a minute.'
        : 'From the token counts Claude reports, at Sonnet 5.5 prices ($2 per million tokens in, $10 out, $0.10 when cached). The real bill is in the Claude Console.'}</p>
    </section>
  )
}

function About() {
  const [st, setSt] = useState('')
  useEffect(() => { void checkForUpdate() }, [])
  return (
    <button class="ver press" onClick={async () => { setSt('Checking…'); setSt((await updateNow()) === 'latest' ? 'Up to date' : 'Updating…') }}>
      <Fleur size={18} /> Hablemos {__VERSION__}{st ? ` · ${st}` : ''}
    </button>
  )
}
