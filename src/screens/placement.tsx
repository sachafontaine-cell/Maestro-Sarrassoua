// The placement test (from Progress): 3 short parts, answered out loud. Each part is checked in
// the background; you can stop after any part and continue later.
import { useEffect, useState } from 'preact/hooks'
import { HINT_AFTER, ITEMS, PARTS, answer, begin, gradePart, inProgress, micTap, nextPart, openTest, partOf, present, ptest, stopAll, type PartState } from '../lib/placement'
import { profile, settings } from '../lib/data'
import { go } from '../lib/nav'
import { canListen } from '../lib/speech'
import { TYPE_LABEL } from '../lib/model'
import { Icon, Spinner } from '../ui'

export function PlacementScreen() {
  const s = ptest.use()
  const key = settings.use().apiKey
  profile.use()
  useEffect(() => { if (!ptest.get()) openTest(); return () => stopAll() }, [])
  if (!s) return null
  const leave = () => { stopAll(); ptest.set(null); go('progress', 'stage', true) }

  if (s.phase === 'intro') {
    const resume = inProgress()
    const at = partOf(Math.min(s.index, ITEMS.length - 1)) + 1
    return (
      <main class="main">
        <div class="between"><h1 class="h1">Placement test</h1><button class="iconbtn ring press" aria-label="Close" onClick={leave}><Icon.x /></button></div>
        <div class="card hero">
          <p><b>3 short parts, about 2 minutes each. All spoken.</b></p>
          <p><Icon.speaker /> <b>Listen</b> items: a question in Spanish at normal speed. Answer it.</p>
          <p><Icon.mic /> <b>Say</b> items: an English sentence. Say it in Spanish.</p>
          <p class="muted">Mistakes are the point. Each part is checked while you do the next one, and your answers are saved: you can stop after any part.</p>
        </div>
        {!key && <p class="err">The test is checked by the AI: add your AI key in Settings first.</p>}
        {!canListen() && <p class="err">Speech recognition isn’t available here: use Chrome on your phone, or type your answers.</p>}
        {resume ? (
          <>
            <button class="btn btn-primary btn-big press" disabled={!key} onClick={() => begin()}>{s.index >= ITEMS.length ? 'See my result' : `Continue (part ${at} of 3)`}</button>
            <button class="btn btn-quiet press" disabled={!key} onClick={() => begin(true)}>Start over</button>
          </>
        ) : <button class="btn btn-primary btn-big press" disabled={!key} onClick={() => begin()}>Start part 1</button>}
      </main>
    )
  }

  if (s.phase === 'break') {
    const done = s.index >= ITEMS.length
    return (
      <main class="main">
        <h1 class="h1">{done ? 'All parts answered' : `Part ${partOf(s.index)} done`}</h1>
        <div class="setgroup" aria-label="Parts">
          {PARTS.map((p, i) => <PartRow i={i} title={p.title} st={s.parts[i]} err={s.partErrors[i]} answered={i < partOf(Math.min(s.index, ITEMS.length)) || done} />)}
        </div>
        {done ? (
          <p class="muted">{s.parts.some((x) => x === 'error') ? 'Your answers are saved: try the check again, nothing to redo.' : 'Your result appears as soon as the last check is done.'}</p>
        ) : (
          <>
            <button class="btn btn-primary btn-big press" onClick={nextPart}>Next: part {partOf(s.index) + 1}, {PARTS[partOf(s.index)].title.toLowerCase()}</button>
            <button class="btn btn-quiet press" onClick={leave}>Stop here, continue later</button>
          </>
        )}
      </main>
    )
  }

  if (s.phase === 'result' && s.result) {
    const r = s.result
    return (
      <main class="main">
        <h1 class="h1">Placement test</h1>
        <div class="card hero">
          <span class="label">Your level</span>
          <div class="levelbig">{r.label}</div>
          <p>{r.summary}</p>
          {r.weak.length > 0 && <p class="muted">Your sessions will focus on: {r.weak.map((t) => TYPE_LABEL[t].toLowerCase()).join(', ')}.</p>}
        </div>
        <button class="btn btn-primary press" onClick={leave}>Done</button>
      </main>
    )
  }

  return <Question />
}

function PartRow({ i, title, st, err, answered }: { i: number; title: string; st: PartState; err?: string; answered: boolean }) {
  return (
    <div class="setrow">
      <span class="grow"><b>Part {i + 1}</b> · {title}{err && <><br /><span class="muted" style={{ color: 'var(--danger)' }}>{err}</span></>}</span>
      {st === 'done' ? <span class="setval ok"><Icon.check />Checked</span>
        : st === 'checking' ? <span class="setval"><Spinner />Checking</span>
        : st === 'error' ? <button class="btn btn-sm btn-quiet press" onClick={() => gradePart(i)}>Try again</button>
        : <span class="setval">{answered ? 'Waiting' : 'Not yet'}</span>}
    </div>
  )
}

function Question() {
  const s = ptest.use()!
  const [typing, setTyping] = useState(!canListen())
  const [text, setText] = useState('')
  const it = ITEMS[s.index]
  const part = partOf(s.index)
  const listening = s.status === 'listening'
  return (
    <div class="sess">
      <header class="sesshead">
        <button class="iconbtn press" aria-label="Stop the test" onClick={() => { stopAll(); ptest.set(null); go('progress', 'stage', true) }}><Icon.x /></button>
        <div class="phases"><span class="on">Part {part + 1} of 3 · {(s.index % 4) + 1}/4</span></div>
        <span class="iconbtn" />
      </header>
      <div class="chat">
        <section class="card reviewcard" aria-live="polite">
          {it.kind === 'listen' ? (
            <>
              <span class="label">Listen and answer</span>
              <button class="btn btn-quiet press" onClick={present} disabled={s.status === 'speaking'}><Icon.speaker />{s.plays ? 'Play again' : 'Play'}</button>
              {s.plays >= HINT_AFTER
                ? <p class="hint-es"><span class="label">Hint</span><br />{it.text}</p>
                : s.plays > 0 && <p class="muted small">Still unclear? The words appear after the {HINT_AFTER === 3 ? 'third' : `${HINT_AFTER}th`} play.</p>}
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
        <button class="link press" style={{ alignSelf: 'center' }} onClick={() => answer('')}>I don’t know, skip</button>
      </div>
      <footer class="dock">
        {typing ? (
          <form class="typebar" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { answer(text.trim()); setText('') } }}>
            <input class="field" value={text} placeholder="Type in Spanish…" aria-label="Type your answer" onInput={(e) => setText((e.target as HTMLInputElement).value)} autoComplete="off" lang="es" />
            <button class="send press" type="submit" aria-label="Send" disabled={!text.trim()}><Icon.send /></button>
          </form>
        ) : <span class="status" role="status">{listening ? 'Listening… tap to send' : s.status === 'speaking' ? 'Listen…' : 'Tap the mic and answer'}</span>}
        <div class="dockrow">
          <button class="side press" aria-label={typing ? 'Speak instead' : 'Type instead'} onClick={() => setTyping(!typing)}>{typing ? <Icon.mic /> : <Icon.keyboard />}{typing ? 'Speak' : 'Type'}</button>
          <button class={`mic press${listening ? ' on' : ''}`} aria-label={listening ? 'Stop and send' : 'Speak'} disabled={typing} onClick={micTap}>{listening ? <Icon.stop /> : <Icon.mic />}</button>
          <span class="side" />
        </div>
      </footer>
    </div>
  )
}
