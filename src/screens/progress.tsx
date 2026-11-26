// Progress: level and stage (the one place the stage is switched, and the placement test),
// mistakes by type, words learned, and session history.
import { useEffect } from 'preact/hooks'
import { cards, mistakes, profile, sessions, setProfile } from '../lib/data'
import { scenario as getScenario, STAGES } from '../lib/curriculum'
import { MISTAKE_TYPES, TYPE_LABEL, type SessionRec, type StageId } from '../lib/model'
import { levelProgress, unlockMissing } from '../lib/plan'
import { LEARNED_STEP, DAY } from '../lib/srs'
import { norm } from '../lib/grade'
import { go, open, overlays, route } from '../lib/nav'
import { openTest } from '../lib/placement'
import { Icon, Seg, Sheet, fmtDate } from '../ui'

export function Progress() {
  const p = profile.use()
  const ms = mistakes.use()
  const cs = cards.use()
  const ss = sessions.use()
  const r = route.use()
  const ov = overlays.use()
  useEffect(() => { if (r.section) document.getElementById(r.section)?.scrollIntoView({ block: 'start' }) }, [r.section])
  const now = Date.now()
  const lv = levelProgress(p.level)
  const list = Object.values(ss).sort((a, b) => b.at - a.at)
  const done = list.filter((s) => s.completed)

  // Mistakes by type, last 30 days (and the 30 before, for the trend).
  const recent = ms.filter((m) => now - m.at < 30 * DAY)
  const before = ms.filter((m) => now - m.at >= 30 * DAY && now - m.at < 60 * DAY)
  const counts = Object.fromEntries(MISTAKE_TYPES.map((t) => [t, recent.filter((m) => m.type === t).length])) as Record<string, number>
  const max = Math.max(1, ...Object.values(counts))
  const freq = new Map<string, { fix: string; said: string; n: number; type: string }>()
  for (const m of recent) { const k = norm(m.fix); const c = freq.get(k); freq.set(k, { fix: m.fix, said: m.said, type: m.type, n: (c?.n ?? 0) + 1 }) }
  const top = [...freq.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 5)

  const all = Object.values(cs)
  const learned = all.filter((c) => c.step >= LEARNED_STEP).sort((a, b) => a.answer.localeCompare(b.answer))
  const learning = all.length - learned.length

  const setStage = (st: StageId) => setProfile({ stage: st, today: undefined })
  const last = p.placements[p.placements.length - 1]
  const detail = ov.find((o) => o.kind === 'history')
  const showWords = ov.some((o) => o.kind === 'words')

  return (
    <main class="main">
      <h1 class="h1">Progress</h1>

      <section class="section" id="stage" aria-label="Level and stage">
        <div class="card hero">
          <div class="between">
            <div><span class="label">Level</span><div class="levelbig">{lv.label}</div></div>
            <span class="muted">next: {lv.next}</span>
          </div>
          <div class="bar" role="progressbar" aria-valuenow={Math.round(lv.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${lv.next}`}><span style={{ width: `${Math.max(4, lv.pct * 100)}%` }} /></div>
          {last && <p class="muted">Placement test {fmtDate(last.at)}: {last.label}. {last.summary}</p>}
          <button class="btn btn-quiet btn-sm press" onClick={() => { openTest(); go('placement') }}>{last ? 'Retake the placement test' : 'Take the placement test'} (5 min)</button>
        </div>
        <span class="label">Stage</span>
        <Seg label="Stage" value={p.stage} onChange={setStage} options={[[1, 'Stage 1 · Rosa'], [2, p.stage2Unlocked ? 'Stage 2 · Catalina' : 'Stage 2 · locked']]} />
        <p class="setnote">
          {p.stage === 1 ? STAGES[1].who : STAGES[2].who}.{' '}
          {p.stage2Unlocked ? 'Stage 2 is unlocked.' : `Stage 2 unlocks when you ${unlockMissing(p.level, list).join(', ')}. You can switch any time.`}
          {p.stage === 2 && ' Her region: Settings → Accents.'}
        </p>
      </section>

      <section class="section" aria-label="Mistakes by type">
        <span class="label">Mistakes by type · last 30 days</span>
        <div class="card card-pad stack">
          {MISTAKE_TYPES.map((t) => {
            const old = before.filter((m) => m.type === t).length
            return (
              <div class="typerow">
                <span>{TYPE_LABEL[t]}</span>
                <div class="bar"><span style={{ width: `${(counts[t] / max) * 100}%` }} /></div>
                <b class="num" title={old ? `${old} the month before` : ''}>{counts[t]}</b>
              </div>
            )
          })}
          {!recent.length && <p class="muted">No mistakes recorded yet: they appear after your first session.</p>}
        </div>
        {top.length > 0 && (
          <div class="setgroup" aria-label="Most frequent">
            {top.map((x) => <div class="setrow"><span class="grow"><b>{x.fix}</b>{x.said && <><br /><span class="muted">not “{x.said}”</span></>}</span><span class="chip plain">×{x.n}</span></div>)}
          </div>
        )}
      </section>

      <section class="section" aria-label="Words learned">
        <span class="label">Words and phrases</span>
        <button class="setgroup press" onClick={() => open({ kind: 'words' })}>
          <div class="setrow"><span class="grow"><b class="num" style={{ fontSize: '22px' }}>{learned.length}</b> learned <span class="muted">· {learning} still in review</span></span><Icon.chev /></div>
        </button>
        <p class="setnote">Learned = remembered at the 3-day review or later.</p>
      </section>

      <section class="section" aria-label="Session history">
        <span class="label">Sessions · {done.length} finished</span>
        {list.length ? (
          <div class="setgroup">
            {list.slice(0, 60).map((s) => (
              <button class="hist press" onClick={() => open({ kind: 'history', arg: s.id })}>
                <span class="date"><span>{new Date(s.at).toLocaleDateString('en', { month: 'short' })}</span><b class="num">{new Date(s.at).getDate()}</b></span>
                <span class="grow"><b>{getScenario(s.scenario).title}</b><br /><span class="muted">{s.minutes} min · {s.mistakes} mistake{s.mistakes === 1 ? '' : 's'}{s.handsFree ? ' · hands-free' : ''}{s.completed ? '' : ' · stopped early'}</span></span>
                <Icon.chev />
              </button>
            ))}
          </div>
        ) : <p class="muted">Your sessions will be listed here.</p>}
      </section>

      {detail && ss[detail.arg ?? ''] && <History s={ss[detail.arg!]} />}
      {showWords && (
        <Sheet title="Words and phrases">
          {learned.length ? learned.map((c) => <div class="setrow"><span class="grow"><b>{c.answer}</b><br /><span class="muted">{c.cue}</span></span></div>) : <p class="muted">Nothing learned yet: items count once you remember them at the 3-day review.</p>}
        </Sheet>
      )}
    </main>
  )
}

function History({ s }: { s: SessionRec }) {
  const spoke = s.myWords + s.tutorWords ? Math.round((100 * s.myWords) / (s.myWords + s.tutorWords)) : 0
  return (
    <Sheet title={getScenario(s.scenario).title}>
      <p class="muted">{fmtDate(s.at)} · {STAGES[s.stage].name} · {s.minutes} min{s.handsFree ? ' · hands-free' : ''}</p>
      <div class="stats">
        <div class="stat"><b class="num">{s.turns}</b><span>your turns</span></div>
        <div class="stat"><b class="num">{s.turns ? `${spoke}%` : '–'}</b><span>you spoke</span></div>
        <div class="stat"><b class="num">{s.reviewed ? `${s.reviewOk}/${s.reviewed}` : '–'}</b><span>review</span></div>
      </div>
      {s.note && <p>{s.note}</p>}
      {s.fixes.map((f) => (
        <div class="fix" style={{ alignSelf: 'stretch', maxWidth: 'none' }}>
          {f.said && <span class="was">{f.said}</span>}
          <span class="right">{f.fix}</span>
          <span class="why">{TYPE_LABEL[f.type]}{f.why ? ` · ${f.why}` : ''}</span>
        </div>
      ))}
      {s.words.length > 0 && <div class="words">{s.words.map((w) => <span class="word"><b>{w.es}</b> · {w.en}</span>)}</div>}
      {s.level && <p class="muted">Tutor’s level estimate that day: {s.level}</p>}
    </Sheet>
  )
}
