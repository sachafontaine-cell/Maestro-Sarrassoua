import { Icon } from './ui'
import { go, route } from './lib/nav'
import { loaded } from './lib/data'
import { Home } from './screens/home'
import { SessionScreen } from './screens/session'
import { Progress } from './screens/progress'
import { Settings } from './screens/settings'
import { PlacementScreen } from './screens/placement'

export function App() {
  const r = route.use()
  if (!loaded.use()) return null
  if (r.name === 'session') return <div class="shell"><SessionScreen /></div>
  if (r.name === 'placement') return <div class="shell"><PlacementScreen /></div>
  const tabs = [['home', 'Home', Icon.home], ['progress', 'Progress', Icon.chart], ['settings', 'Settings', Icon.gear]] as const
  return (
    <div class="shell">
      {r.name === 'progress' ? <Progress /> : r.name === 'settings' ? <Settings /> : <Home />}
      <nav class="tabbar" aria-label="Sections">
        {tabs.map(([name, label, I]) => (
          <button class={`tab press${r.name === name ? ' on' : ''}`} aria-current={r.name === name ? 'page' : undefined} onClick={() => go(name, undefined, true)}>
            <I />{label}
          </button>
        ))}
      </nav>
    </div>
  )
}
