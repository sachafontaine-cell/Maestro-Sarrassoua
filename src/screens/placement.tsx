// The 5-minute placement test (from Progress). Answer each item out loud.
import { useEffect } from 'preact/hooks'
import { ITEMS, answer, begin, gradeTest, micTap, openTest, ptest, replayItem, stopAll } from '../lib/placement'
import { settings } from '../lib/data'
import { go } from '../lib/nav'
import { canListen } from '../lib/speech'
import { TYPE_LABEL } from '../lib/model'
import { Icon, Spinner } from '../ui'

export function PlacementScreen() {
  const s = ptest.use()
  const key = settings.use().apiKey
  useEffect(() => { if (!ptest.get()) openTest(); return () => stopAll() }, [])
  if (!s) return null
  const leave = () => { stopAll(); ptest.set(null); go('progress', 'stage', true) }

  if (s.phase === 'intro') {
    return (
      <main class="main">
        <div class="between"><h1 class="h1">Placement test</h1><button class="iconbtn ring press" aria-label="Close" onClick={leave}><Icon.x /></button></div>
        <div class="card hero">
          <p><b>5 minutes, {ITEMS.length} questions, all spoken.</b></p>
          <p>Some are questions in Spanish at normal speed: answer them. Others are English sentences: say them in Spanish. Don’t worry about mistakes, they are the point.</p>
          <p class="muted">It sets your level and what your sessions focus on. You can retake it any time.</p>
        </div>
        {!key && <p class="err">The test is graded by the AI: add your AI key in Settings first.</p>}
        {!canListen() && <p class="err">Speech recognition isn’t available here: use Chrome on your phone.</p>}
        <button class="btn btn-primary btn-big press" disabled={!key} onClick={begin}>Start</button>
      </main>
    )
  }

  if (s.phase === 'grading' || s.phase === 'result') {
    const r = s.result
    return (
      <main class="main">
        <h1 class="h1">Placement test</h1>
        {s.phase === 'grading' && !s.error && <div class="empty stack" style={{ alignItems: 'center' }}><Spinner /><p>Grading your answers…</p></div>}
        {s.error && <div class="err" role="alert"><span>{s.error}</span><button class="btn btn-sm press" onClick={gradeTest}>Try again</button></div>}
        {r && (
          <div class="card hero">
            <span class="label">Your level</span>
            <div class="levelbig">{r.label}</div>
            <p>{r.summary}</p>
            {r.weak.length > 0 && <p class="muted">Sessions will focus on: {r.weak.map((t) => TYPE_LABEL[t].toLowerCase()).join(', ')}.</p>}
          </div>
        )}
        {r && <button class="btn btn-primary press" onClick={leave}>Done</button>}
      </main>
    )
  }

  const it = ITEMS[s.index]
  const listening = s.status === 'listening'
  return (
    <div class="sess">
      <header class="sesshead">
        <button class="iconbtn press" aria-label="Stop the test" onClick={leave}><Icon.x /></button>
        <div class="phases"><span class="on">{s.index + 1} / {ITEMS.length}</span></div>
        <span class="timer" />
      </header>
      <div class="chat">
        <section class="card reviewcard" aria-live="polite">
          {it.kind === 'listen' ? (
            <>
              <span class="label">Listen and answer</span>
              <p class="cue"><Icon.speaker /></p>
              <button class="btn btn-quiet btn-sm press" onClick={replayItem}><Icon.repeat />Play again</button>
            </>
          ) : (
            <>
              <span class="label">Say it in Spanish</span>
              <p class="cue">{it.text}</p>
            </>
          )}
          {s.interim && <p class="muted">“{s.interim}”</p>}
          {s.error && <p class="muted" style={{ color: 'var(--danger)' }} role="alert">{s.error}</p>}
        </section>
        <button class="link press" style={{ alignSelf: 'center' }} onClick={() => answer('')}>Skip this one</button>
      </div>
      <footer class="dock">
        <span class="status" role="status">{listening ? 'Listening… tap to send' : s.status === 'speaking' ? 'Listen…' : 'Tap the mic and answer'}</span>
        <div class="dockrow">
          <span />
          <button class={`mic press${listening ? ' on' : ''}`} aria-label={listening ? 'Stop and send' : 'Speak'} onClick={micTap}>{listening ? <Icon.stop /> : <Icon.mic />}</button>
          <span />
        </div>
      </footer>
    </div>
  )
}
