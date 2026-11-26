// Screens are hash routes (#/, #/session, #/progress, #/settings, #/placement), with an optional
// section (#/settings/key) to scroll to. Sheets are overlays on top; Android's back button
// closes the top sheet first (each one adds a history step), then goes back a screen.
import { createStore } from './store'

export type Screen = 'home' | 'session' | 'progress' | 'settings' | 'placement'
export interface Route { name: Screen; section?: string }

export function parse(hash: string): Route {
  const [name, section] = hash.replace(/^#\/?/, '').split('/')
  const n = (['session', 'progress', 'settings', 'placement'] as const).find((x) => x === name)
  return { name: n ?? 'home', section: section || undefined }
}

const read = () => parse(typeof location === 'undefined' ? '' : location.hash)
export const route = createStore<Route>(read())

export type Overlay = { kind: string; arg?: string }
export const overlays = createStore<Overlay[]>([])

if (typeof addEventListener === 'function') {
  addEventListener('hashchange', () => { overlays.set([]); route.set(read()) })
  addEventListener('popstate', (e) => {
    const depth = (e.state as { ov?: number } | null)?.ov ?? 0
    if (overlays.get().length > depth) overlays.set(overlays.get().slice(0, depth))
  })
}

export function go(name: Screen, section?: string, replace = false) {
  const hash = name === 'home' ? '#/' : `#/${name}${section ? '/' + section : ''}`
  overlays.set([])
  if (replace) { history.replaceState(null, '', hash); route.set(parse(hash)) } else location.hash = hash
}

export function open(o: Overlay) {
  const next = [...overlays.get(), o]
  history.pushState({ ov: next.length }, '')
  overlays.set(next)
}
export function close() { if (overlays.get().length) history.back() }
