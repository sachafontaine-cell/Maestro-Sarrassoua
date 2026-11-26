// The app's data in memory, saved to IndexedDB in the background (db.ts).
import { createStore } from './store'
import { del, put, readAll } from './db'
import { defaultProfile, defaultSettings, type Card, type Mistake, type Profile, type SessionRec, type Settings, type Usage } from './model'

export const settings = createStore<Settings>(defaultSettings())
export const profile = createStore<Profile>(defaultProfile())
export const sessions = createStore<Record<string, SessionRec>>({})
export const mistakes = createStore<Mistake[]>([])
export const cards = createStore<Record<string, Card>>({})
export const usage = createStore<Usage[]>([])

export const loaded = createStore(false)

/** Reads everything from the phone once, at start (a few milliseconds). */
export async function load() {
  const [kv, ss, ms, cs, us] = await Promise.all([
    readAll<unknown>('kv'), readAll<SessionRec>('sessions'), readAll<Mistake>('mistakes'), readAll<Card>('cards'), readAll<Usage>('usage'),
  ])
  const k = Object.fromEntries(kv)
  settings.set({ ...defaultSettings(), ...(k.settings as Partial<Settings> | undefined) })
  profile.set({ ...defaultProfile(), ...(k.profile as Partial<Profile> | undefined) })
  sessions.set(Object.fromEntries(ss))
  mistakes.set(ms.map(([, m]) => m).sort((a, b) => a.at - b.at))
  cards.set(Object.fromEntries(cs))
  usage.set(us.map(([, u]) => u).sort((a, b) => a.at - b.at))
  loaded.set(true)
}

export function setSettings(patch: Partial<Settings>) {
  const next = { ...settings.get(), ...patch }
  for (const k of Object.keys(next) as (keyof Settings)[]) if (next[k] === undefined) delete next[k]
  settings.set(next)
  put('kv', 'settings', next)
}
export function setProfile(patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) {
  const cur = profile.get()
  const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }
  profile.set(next)
  put('kv', 'profile', next)
}
export function saveSession(s: SessionRec) {
  sessions.set({ ...sessions.get(), [s.id]: s })
  put('sessions', s.id, s)
}
export function addMistakes(list: Mistake[]) {
  if (!list.length) return
  mistakes.set([...mistakes.get(), ...list])
  for (const m of list) put('mistakes', m.id, m)
}
export function saveCards(list: Card[]) {
  if (!list.length) return
  const next = { ...cards.get() }
  for (const c of list) { next[c.id] = c; put('cards', c.id, c) }
  cards.set(next)
}
export function removeCard(id: string) {
  const next = { ...cards.get() }
  delete next[id]
  cards.set(next)
  del('cards', id)
}
export function addUsage(u: Usage) {
  usage.set([...usage.get(), u])
  put('usage', u.id, u)
}
