// One file with everything on this phone: settings, level, sessions, mistakes, review list and
// cost history. The API key is left out on purpose (a backup file gets passed around).
import { cards, mistakes, profile, sessions, settings, usage } from './data'
import { clearTable, flush, put } from './db'
import { defaultProfile, defaultSettings, type Card, type Mistake, type Profile, type SessionRec, type Settings, type Usage } from './model'

export interface Backup {
  app: 'hablemos'
  format: 1
  at: string
  settings: Omit<Settings, 'apiKey'>
  profile: Profile
  sessions: SessionRec[]
  mistakes: Mistake[]
  cards: Card[]
  usage: Usage[]
}

export function makeBackup(now = new Date()): Backup {
  const { apiKey: _key, ...rest } = settings.get()
  return {
    app: 'hablemos', format: 1, at: now.toISOString(), settings: rest, profile: profile.get(),
    sessions: Object.values(sessions.get()), mistakes: mistakes.get(), cards: Object.values(cards.get()), usage: usage.get(),
  }
}

export const backupName = (now = new Date()) => `hablemos-backup-${now.toISOString().slice(0, 10)}.json`

const hasId = (x: unknown): x is { id: string } => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string'

/** Checks a file before anything is replaced. */
export function readBackup(raw: unknown): { ok: true; data: Backup } | { ok: false; why: string } {
  const b = raw as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== 'hablemos') return { ok: false, why: 'This file is not a Hablemos backup.' }
  if (b.format !== 1) return { ok: false, why: 'This backup is from a newer version of Hablemos: update the app first.' }
  for (const k of ['sessions', 'mistakes', 'cards', 'usage'] as const) {
    const list = b[k]
    if (!Array.isArray(list) || !list.every(hasId)) return { ok: false, why: `The backup is damaged (${k}).` }
  }
  if (!b.settings || typeof b.settings !== 'object' || !b.profile || typeof b.profile !== 'object') return { ok: false, why: 'The backup is damaged (settings).' }
  return { ok: true, data: b as Backup }
}

/** Replaces this phone's data with the backup. The API key on this phone is kept. */
export async function restoreBackup(b: Backup) {
  const key = settings.get().apiKey
  for (const t of ['sessions', 'mistakes', 'cards', 'usage'] as const) await clearTable(t)
  const s: Settings = { ...defaultSettings(), ...b.settings, ...(key ? { apiKey: key } : {}) }
  const p: Profile = { ...defaultProfile(), ...b.profile }
  settings.set(s); put('kv', 'settings', s)
  profile.set(p); put('kv', 'profile', p)
  sessions.set(Object.fromEntries(b.sessions.map((x) => [x.id, x]))); b.sessions.forEach((x) => put('sessions', x.id, x))
  mistakes.set([...b.mistakes].sort((x, y) => x.at - y.at)); b.mistakes.forEach((x) => put('mistakes', x.id, x))
  cards.set(Object.fromEntries(b.cards.map((x) => [x.id, x]))); b.cards.forEach((x) => put('cards', x.id, x))
  usage.set([...b.usage].sort((x, y) => x.at - y.at)); b.usage.forEach((x) => put('usage', x.id, x))
  await flush()
}
