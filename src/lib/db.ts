// IndexedDB on the phone: one database, five tables. Everything is read once at start (a few
// hundred small records) and written in the background, so a tap never waits for storage.
// Without IndexedDB (tests, a locked-down browser) the data lives in memory for the visit.

export const TABLES = ['kv', 'sessions', 'mistakes', 'cards', 'usage'] as const
export type Table = (typeof TABLES)[number]

const NAME = 'hablemos'
const VERSION = 1

let dbp: Promise<IDBDatabase | null> | null = null
const mem = new Map<Table, Map<string, unknown>>(TABLES.map((t) => [t, new Map()]))

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return dbp
}

/** Every record of a table, as [key, value] pairs. */
export async function readAll<T>(t: Table): Promise<[string, T][]> {
  const db = await open()
  if (!db) return [...(mem.get(t) as Map<string, T>).entries()]
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(t, 'readonly')
      const store = tx.objectStore(t)
      const keys = store.getAllKeys()
      const vals = store.getAll()
      tx.oncomplete = () => resolve((keys.result as IDBValidKey[]).map((k, i) => [String(k), vals.result[i] as T]))
      tx.onerror = () => resolve([])
    } catch { resolve([]) }
  })
}

// Writes are queued and sent together in one transaction per table, on the next idle moment.
type Op = { put: true; v: unknown } | { put: false }
const queue = new Map<Table, Map<string, Op>>()
let flushing: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export function put(t: Table, key: string, v: unknown) { enqueue(t, key, { put: true, v }) }
export function del(t: Table, key: string) { enqueue(t, key, { put: false }) }

function enqueue(t: Table, key: string, op: Op) {
  const m = mem.get(t)!
  if (op.put) m.set(key, op.v); else m.delete(key)
  if (!queue.has(t)) queue.set(t, new Map())
  queue.get(t)!.set(key, op)
  if (!timer) timer = setTimeout(() => { timer = null; void flush() }, 60)
}

export async function flush(): Promise<void> {
  if (flushing) await flushing
  if (!queue.size) return
  const batch = new Map(queue)
  queue.clear()
  flushing = (async () => {
    const db = await open()
    if (!db) return
    await Promise.all([...batch].map(([t, ops]) => new Promise<void>((done) => {
      try {
        const tx = db.transaction(t, 'readwrite')
        const s = tx.objectStore(t)
        for (const [k, op] of ops) { if (op.put) s.put(op.v, k); else s.delete(k) }
        tx.oncomplete = () => done()
        tx.onerror = () => done()
        tx.onabort = () => done()
      } catch { done() }
    })))
  })()
  await flushing
  flushing = null
}

/** Empties a table (used by Import, before writing the backup's records). */
export async function clearTable(t: Table) {
  mem.get(t)!.clear()
  queue.get(t)?.clear()
  const db = await open()
  if (!db) return
  await new Promise<void>((done) => {
    try { const tx = db.transaction(t, 'readwrite'); tx.objectStore(t).clear(); tx.oncomplete = () => done(); tx.onerror = () => done() } catch { done() }
  })
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => { void flush() })
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush() })
}
