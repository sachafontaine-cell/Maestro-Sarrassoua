// The session: review, then the conversation, then the recap. Tap-to-talk with the big gold
// mic (thumb reach), or hands-free: three big buttons and nothing to read.
import { useEffect, useRef, useState } from 'preact/hooks'
import { live, micTap, sendTyped, setHandsFree, finishNow, endQuietly, pause, resume, repeatLast, replay, retry, skipReview, cancelListening, type Bubble, type Live } from '../lib/session'
import { scenario as getScenario } from '../lib/curriculum'
import { TYPE_LABEL } from '../lib/model'
import { go, open, overlays } from '../lib/nav'
import { canListen } from '../lib/speech'
import { Icon, Sheet, Spinner } from '../ui'

export function SessionScreen() {
  const l = live.use()
  overlays.use()
  // Leaving the screen (back button, another tab) stops the session; what was done is kept.
  useEffect(() => () => endQuietly(), [])
  if (!l) {
    return (
      <main class="main">
        <div class="empty stack"><p>No session running.</p><button class="btn btn-primary press" onClick={() => go('home', undefined, true)}>Back to Home</button></div>
      </main>
    )
  }
  return (
    <>
      {l.handsFree && l.phase !== 'done' ? <HandsFree l={l} /> : <Screen l={l} />}
      {overlays.get().some((o) => o.kind === 'end') && <EndSheet />}
    </>
  )
}

function useClock(l: Live) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [])
  const s = Math.floor((Date.now() - l.startedAt) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const STATUS: Record<Live['status'], string> = {
  idle: '', waiting: 'Tap the mic and speak', listening: 'Listening… tap to send', thinking: 'Thinking…', speaking: 'Speaking… tap the mic to answer', paused: 'Paused',
}

function Screen({ l }: { l: Live }) {
  const clock = useClock(l)
  const done = l.phase === 'done'
  const ended = l.phase === 'recap' || done
  return (
    <div class="sess">
      <header class="sesshead">
        <button class="iconbtn press" aria-label={done ? 'Close' : 'End session'} onClick={() => (done ? go('home', undefined, true) : open({ kind: 'end' }))}><Icon.x /></button>
        <div class="phases" aria-label="Session steps">
          {l.review.items.length > 0 && <span class={l.phase === 'review' ? 'on' : ''}>Review</span>}
          <span class={l.phase === 'talk' ? 'on' : ''}>Talk</span>
          <span class={ended ? 'on' : ''}>Recap</span>
        </div>
        <span class="timer num" aria-label="Time">{clock}</span>
        {!ended && <button class="iconbtn ring press" aria-label="Switch to hands-free" onClick={() => setHandsFree(true)}><Icon.car /></button>}
      </header>
      {l.phase === 'review' ? <Review l={l} /> : ended ? <RecapView l={l} /> : <Chat l={l} />}
      {!ended && <Dock l={l} />}
    </div>
  )
}

function Review({ l }: { l: Live }) {
  const it = l.review.items[l.review.index]
  return (
    <div class="chat">
      <p class="scene"><span>Quick review · {Math.min(l.review.index + 1, l.review.items.length)} of {l.review.items.length}</span><span>Say it in Spanish, out loud.</span></p>
      {it && (
        <section class="card reviewcard" aria-live="polite">
          <span class="label">How do you say…</span>
          <p class="cue">{it.card.cue.replace(/^how do you say:?\s*/i, '')}</p>
          {l.review.shown && (
            <>
              <span class={`chip verdict ${l.review.shown === 'right' ? 'ok' : l.review.shown === 'close' ? 'gold' : 'red'}`}>{l.review.shown === 'right' ? '¡Muy bien!' : l.review.shown === 'close' ? 'Almost' : 'Not quite'}</span>
              <p class="answer">{it.card.answer}</p>
              {it.heard && l.review.shown !== 'right' && <p class="muted">You said: “{it.heard}”</p>}
            </>
          )}
          {!l.review.shown && l.interim && <p class="muted">“{l.interim}”</p>}
        </section>
      )}
      <ErrorBox l={l} />
      <button class="link press" style={{ alignSelf: 'center' }} onClick={skipReview}>Skip to the conversation</button>
    </div>
  )
}

function Chat({ l }: { l: Live }) {
  const sc = getScenario(l.scenario)
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [l.bubbles.length, l.bubbles[l.bubbles.length - 1]?.text, l.interim, l.error])
  return (
    <div class="chat" ref={ref} aria-live="polite">
      <p class="scene"><b>{sc.title}</b><span>{sc.goal}</span></p>
      {l.bubbles.map((b) => b.who === 'me' ? <Mine b={b} /> : (
        <TutorBubble b={b} hide={!!sc.phone && !shown[b.id]} onShow={() => setShown({ ...shown, [b.id]: true })} />
      ))}
      {l.status === 'listening' && l.interim && <div class="bubble me ghost">{l.interim}</div>}
      <ErrorBox l={l} />
    </div>
  )
}

function TutorBubble({ b, hide, onShow }: { b: Bubble; hide: boolean; onShow: () => void }) {
  if (b.streaming && !b.text) return <div class="bubble tutor" aria-label="Thinking"><span class="dots"><i /><i /><i /></span></div>
  if (hide) return <button class="bubble tutor hidden-text press" onClick={onShow}><span><Icon.phone /> Phone call: listen first. Tap to see the words.</span></button>
  return (
    <button class="bubble tutor press" onClick={() => b.segs && replay(b.segs)} aria-label={`${b.text}. Tap to hear again.`}>
      {b.segs ? b.segs.map((s) => <span class={s.lang === 'en' ? 'en' : ''}>{s.text}</span>) : <span>{b.text}</span>}
      {!b.streaming && <span class="play"><Icon.speaker />Tap to hear again</span>}
    </button>
  )
}

function Mine({ b }: { b: Bubble }) {
  const [peek, setPeek] = useState(false)
  return (
    <>
      <div class="bubble me">{b.text}</div>
      {b.corrections?.filter((c) => c.big).map((c) => c.revealed || peek ? (
        <div class="fix" role="note">
          {c.said && <span class="was">{c.said}</span>}
          <span class="right">{c.fix}</span>
          <span class="why">{TYPE_LABEL[c.type]}{c.why ? ` · ${c.why}` : ''}</span>
        </div>
      ) : (
        <button class="fix try press" onClick={() => setPeek(true)}>
          <span class="right">Try to fix it yourself first</span>
          <span class="why">{TYPE_LABEL[c.type]} · tap to see the answer</span>
        </button>
      ))}
    </>
  )
}

function ErrorBox({ l }: { l: Live }) {
  if (!l.error) return null
  if (l.error.msg === 'MIC_DENIED') {
    return (
      <div class="err" role="alert">
        <b>The microphone is blocked</b>
        <span>Chrome: tap the icon left of the address, then Permissions → Microphone → Allow. Installed app: long-press the Hablemos icon → App info → Permissions → Microphone. If your work profile blocks it, you can still type your answers (keyboard button).</span>
        <button class="btn btn-sm press" onClick={resume}>Try again</button>
      </div>
    )
  }
  return (
    <div class="err" role="alert">
      <span>{l.error.msg}</span>
      {l.error.retry && <button class="btn btn-sm press" onClick={retry}>Try again</button>}
      {/API key/.test(l.error.msg) && <button class="btn btn-sm press" onClick={() => go('settings', 'key')}>Open Settings</button>}
    </div>
  )
}

function Dock({ l }: { l: Live }) {
  const [typing, setTyping] = useState(!canListen())
  const [text, setText] = useState('')
  const listening = l.status === 'listening'
  const canTalk = l.status === 'waiting' || l.status === 'speaking' || listening
  const submit = () => { if (text.trim()) { sendTyped(text); setText('') } }
  return (
    <footer class="dock">
      {typing ? (
        <form class="typebar" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <input class="field" value={text} placeholder="Type in Spanish…" aria-label="Type your answer" onInput={(e) => setText((e.target as HTMLInputElement).value)} enterKeyHint="send" autoComplete="off" autoCorrect="off" spellcheck={false} lang="es" />
          <button class="send press" type="submit" aria-label="Send" disabled={!text.trim() || l.status === 'thinking'}><Icon.send /></button>
        </form>
      ) : <span class="status" role="status">{l.status === 'paused' && !l.error ? 'Paused' : STATUS[l.status]}</span>}
      <div class="dockrow">
        <button class="side press" aria-label={typing ? 'Speak instead' : 'Type instead'} onClick={() => { cancelListening(); setTyping(!typing) }}>{typing ? <Icon.mic /> : <Icon.keyboard />}{typing ? 'Speak' : 'Type'}</button>
        {l.status === 'paused' && !l.error
          ? <button class="mic press" aria-label="Resume" onClick={resume}><Icon.play /></button>
          : <button class={`mic press${listening ? ' on' : ''}`} aria-label={listening ? 'Stop and send' : 'Speak'} disabled={!canTalk || typing} onClick={micTap}>{listening ? <Icon.stop /> : l.status === 'thinking' ? <Spinner /> : <Icon.mic />}</button>}
        <button class="side press" aria-label="Repeat" onClick={repeatLast} disabled={l.status === 'thinking'}><Icon.repeat />Repeat</button>
      </div>
    </footer>
  )
}

function RecapView({ l }: { l: Live }) {
  const r = l.recap
  if (!r) {
    return (
      <div class="chat">
        <div class="empty stack" style={{ alignItems: 'center' }}><Spinner /><p>Writing your recap…</p></div>
        <ErrorBox l={l} />
      </div>
    )
  }
  return (
    <div class="chat">
      <section class="recap" aria-label="Recap">
        <h2 class="h2">Recap</h2>
        <div class="stats">
          <div class="stat"><b class="num">{r.minutes}</b><span>minutes</span></div>
          <div class="stat"><b class="num">{l.turns ? `${r.spoke}%` : '–'}</b><span>you spoke</span></div>
          <div class="stat"><b class="num">{r.reviewed ? `${r.reviewOk}/${r.reviewed}` : '–'}</b><span>review</span></div>
        </div>
        <p>{r.noteEn}</p>
        {r.noteEs && <p class="muted"><i>{r.noteEs}</i></p>}
        {r.fixes.length > 0 && <h3 class="h3">Your top {r.fixes.length === 1 ? 'fix' : `${r.fixes.length} fixes`}</h3>}
        {r.fixes.map((f) => (
          <div class="fix" style={{ alignSelf: 'stretch', maxWidth: 'none' }}>
            {f.said && <span class="was">{f.said}</span>}
            <span class="right">{f.fix}</span>
            <span class="why">{TYPE_LABEL[f.type]}{f.why ? ` · ${f.why}` : ''}</span>
          </div>
        ))}
        {r.words.length > 0 && (
          <>
            <h3 class="h3">New words</h3>
            <div class="words">{r.words.map((w) => <span class="word"><b>{w.es}</b> · {w.en}</span>)}</div>
          </>
        )}
        {r.added > 0 && <p class="muted">{r.added} added to your review list (back tomorrow).</p>}
        {l.phase === 'done' && <button class="btn btn-primary press" onClick={() => go('home', undefined, true)}>Done</button>}
        {l.phase !== 'done' && <p class="muted tcenter">Reading it aloud…</p>}
      </section>
    </div>
  )
}

function HandsFree({ l }: { l: Live }) {
  const paused = l.status === 'paused'
  const icon = l.status === 'listening' ? <Icon.mic /> : l.status === 'speaking' ? <Icon.speaker /> : paused ? <Icon.pause /> : <span class="dots"><i /><i /><i /></span>
  return (
    <div class="hf">
      <div class="top">
        <button class="press" onClick={() => setHandsFree(false)} aria-label="Use the screen"><Icon.back />Screen</button>
        <span class="sr" role="status">{paused ? 'Paused' : l.status}</span>
      </div>
      <div class={`orb ${l.status}`} aria-hidden="true"><span>{icon}</span></div>
      {l.error?.mic && <p class="tcenter">The microphone is blocked. Tap “Screen” for help.</p>}
      {l.error && !l.error.mic && !l.error.retry && <p class="tcenter">{l.error.msg}</p>}
      <div class="hfbtns">
        <button class="hfbtn wide press" onClick={() => (paused ? (l.error?.retry ? retry() : resume()) : pause())} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? <><Icon.play />Resume</> : <><Icon.pause />Pause</>}</button>
        <button class="hfbtn press" onClick={repeatLast} aria-label="Repeat"><Icon.repeat />Repeat</button>
        <button class="hfbtn end press" onClick={finishNow} aria-label="End"><Icon.stop />End</button>
      </div>
    </div>
  )
}

function EndSheet() {
  const l = live.get()
  return (
    <Sheet title="End the session?">
      <p class="muted">The recap lists your top fixes and adds them to your review.</p>
      <button class="btn btn-primary press" onClick={() => { history.back(); finishNow() }}>End and see my recap</button>
      <button class="btn btn-quiet press" onClick={() => { history.back(); setTimeout(() => go('home', undefined, true), 0) }}>Quit without a recap</button>
      {l && l.phase === 'talk' && <button class="btn btn-quiet press" onClick={() => history.back()}>Keep going</button>}
    </Sheet>
  )
}
