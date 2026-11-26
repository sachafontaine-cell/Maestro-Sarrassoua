import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { load, profile, saveCards, setProfile, settings } from './lib/data'
import { newCard, SEEDS } from './lib/srs'
import { loadVoices } from './lib/speech'
import { loadSdk, provider } from './lib/ai'
import { route, go } from './lib/nav'
import { startUpdates, setHomeCheck } from './lib/update'

await load()

// First start: the placement test's weak spots become the first review items.
if (!profile.get().seeded) {
  const now = Date.now()
  saveCards(SEEDS.map((s) => newCard({ ...s, source: 'seed' }, now, true)))
  setProfile({ seeded: true })
}
// A session can't be resumed after the app was closed: start on Home.
if (route.get().name === 'session' || route.get().name === 'placement') go('home', undefined, true)

render(<App />, document.getElementById('app')!)

// Once the first screen is up: voices and the AI library load in the background.
const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 600))
idle(() => { void loadVoices(); if (provider() === 'claude' && settings.get().apiKey) void loadSdk() })

// A new version is applied when you leave the app, never in the middle of a session.
setHomeCheck(() => route.get().name !== 'session' && route.get().name !== 'placement')
startUpdates()
