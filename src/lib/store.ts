// A tiny shared value: read it anywhere, and components re-render when it changes.
// Saving to the phone is done by data.ts (IndexedDB), not here.
import { useEffect, useState } from 'preact/hooks'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(l: () => void): () => void
  use(): T
}

export function createStore<T>(initial: T): Store<T> {
  let value: T = initial
  const listeners = new Set<() => void>()
  const store: Store<T> = {
    get: () => value,
    set(next) {
      const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next
      if (v === value) return
      value = v
      listeners.forEach((l) => l())
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l) } },
    use() {
      const [, force] = useState(0)
      useEffect(() => store.subscribe(() => force((n) => n + 1)), [])
      return value
    },
  }
  return store
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
