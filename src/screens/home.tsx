// Home: one big button for today's session, today's scenario, and the streak.
import { cards, mistakes, profile, sessions, setProfile, settings } from '../lib/data'
import { scenario as getScenario, STAGES, stageScenarios, REGIONS } from '../lib/curriculum'
import { dayKey, pickScenario, priorFrom, rankWeak, streak, todayScenario, lastPracticed, weakness } from '../lib/plan'
import { dueCards } from '../lib/srs'
import { go, open, overlays } from '../lib/nav'
import { startSession } from '../lib/session'
import { Fleur, Icon, Sheet } from '../ui'
import { useEffect } from 'preact/hooks'

export function Home() {
  const p = profile.use()
  const s = settings.use()
  const ss = sessions.use()
  const ms = mistakes.use()
  const cs = cards.use()
  overlays.use()
  const now = Date.now()
  const list = Object.values(ss)
  const today = todayScenario(p, ms, list, now)
  const sc = getScenario(today.id)
  const doneToday = list.filter((x) => x.completed && dayKey(x.at) === dayKey(now))
  const due = dueCards(Object.values(cs), now).length
  const days = streak(list, now)
  // Keep today's pick for the whole day.
  useEffect(() => { if (today.fresh) setProfile({ today: { date: dayKey(now), stage: p.stage, scenario: today.id } }) }, [today.id, today.fresh])
  const who = p.stage === 1 ? 'Rosa · Mexico City' : `Catalina · ${REGIONS[s.region].city}`

  const start = (handsFree: boolean) => {
    let id = today.id
    // Already practised today: the next best scenario.
    if (doneToday.some((x) => x.scenario === id)) id = pickScenario(p.stage, rankWeak(weakness(ms, list, now, priorFrom(p))), lastPracticed(list), now, id).id
    startSession({ handsFree, scenario: id })
    go('session')
  }

  return (
    <main class="main">
      <div class="between">
        <div class="brand"><Fleur size={24} /><h1 class="h1">Hablemos</h1></div>
        <span class="streak" aria-label={`${days}-day streak`}><Icon.flame />{days} {days === 1 ? 'day' : 'days'}</span>
      </div>

      {p.stage2Unlocked && !p.unlockSeen && (
        <button class="banner press" onClick={() => { setProfile({ unlockSeen: true }); go('progress', 'stage') }}>
          <span class="avatar">C</span>
          <span class="grow"><b>Stage 2 is unlocked</b><br /><span class="muted">You’re ready for Catalina, your Colombian friend.</span></span>
          <Icon.chev />
        </button>
      )}

      <section class="card today" aria-label="Today's session">
        <div class="between">
          <span class="label">{doneToday.length ? 'Done today' : 'Today'} · {STAGES[p.stage].name}</span>
          {doneToday.length > 0 && <span class="chip ok"><Icon.check />{doneToday.reduce((a, x) => a + x.minutes, 0)} min</span>}
        </div>
        <h2 class="h2">{sc.title}</h2>
        <p>{sc.goal}</p>
        <div class="who"><span class="avatar">{p.stage === 1 ? 'R' : 'C'}</span>{who}{sc.phone && <span class="chip plain"><Icon.phone />Phone call</span>}</div>
        <div class="between">
          <span class="muted">{due ? `${due} to review first` : 'Nothing to review today'} · ~15 min</span>
          <button class="link press" onClick={() => open({ kind: 'scenarios' })}>Change</button>
        </div>
      </section>

      <div class="startdock">
        {!s.apiKey ? (
          <>
            <button class="btn btn-primary btn-big press" onClick={() => go('settings', 'key')}>Add your AI key</button>
            <p class="muted tcenter">One time: the tutor needs it. It stays on this phone.</p>
          </>
        ) : (
          <>
            <button class="btn btn-primary btn-big press" onClick={() => start(s.handsFreeDefault)}>
              {s.handsFreeDefault && <Icon.car />}{doneToday.length ? 'Practice again' : 'Start today’s session'}
            </button>
            <button class="btn btn-quiet press" onClick={() => start(!s.handsFreeDefault)}>
              {s.handsFreeDefault ? <><Icon.mic />Start with the screen</> : <><Icon.car />Start hands-free</>}
            </button>
          </>
        )}
      </div>
      {overlays.get().some((o) => o.kind === 'scenarios') && <Scenarios current={today.id} />}
    </main>
  )
}

/** The one place today's scenario is changed. */
function Scenarios({ current }: { current: string }) {
  const p = profile.get()
  return (
    <Sheet title="Today’s scenario">
      <p class="muted">{STAGES[p.stage].name}: {STAGES[p.stage].who}. To switch stage: Progress → Stage.</p>
      {stageScenarios(p.stage).map((sc) => (
        <button class={`choice press${sc.id === current ? ' on' : ''}`} aria-pressed={sc.id === current} onClick={() => { setProfile({ today: { date: dayKey(Date.now()), stage: p.stage, scenario: sc.id } }); history.back() }}>
          <span class="grow"><b>{sc.title}</b><br /><span class="muted">{sc.goal}</span></span>
          {sc.id === current && <Icon.check />}
        </button>
      ))}
    </Sheet>
  )
}
