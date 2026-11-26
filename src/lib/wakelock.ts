// Keeps the screen on during a session (hands-free above all: a locked phone stops listening).
// The phone releases it by itself when the app is hidden; it is asked again when it comes back.
let sentinel: WakeLockSentinel | null = null
let wanted = false

export async function keepAwake(want: boolean) {
  wanted = want
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
  if (want && !sentinel) {
    try {
      const s = await navigator.wakeLock.request('screen')
      sentinel = s
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null })
    } catch { /* refused (battery saver): the session still works */ }
  } else if (!want && sentinel) {
    const s = sentinel
    sentinel = null
    try { await s.release() } catch { /* already gone */ }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wanted) void keepAwake(true) })
}
