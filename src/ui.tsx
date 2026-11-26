import type { ComponentChildren } from 'preact'
import { useLayoutEffect } from 'preact/hooks'
import { close } from './lib/nav'

const svg = (d: ComponentChildren, fill = false) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>
)
export const Icon = {
  home: () => svg(<><path d="M3.5 11L12 4l8.5 7" /><path d="M6 9.5V20h12V9.5" /></>),
  chart: () => svg(<><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>),
  gear: () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  mic: () => svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>),
  stop: () => svg(<rect x="7" y="7" width="10" height="10" rx="2" />, true),
  x: () => svg(<path d="M6 6l12 12M18 6L6 18" />),
  back: () => svg(<path d="M15 5l-7 7 7 7" />),
  chev: () => svg(<path d="M9 5l7 7-7 7" />),
  check: () => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  play: () => svg(<path d="M8 5.5v13l10.5-6.5z" />, true),
  pause: () => svg(<><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></>, true),
  repeat: () => svg(<><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9" /><path d="M19.5 4.5V9H15" /><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15" /><path d="M4.5 19.5V15H9" /></>),
  keyboard: () => svg(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>),
  send: () => svg(<path d="M12 19V5M6 11l6-6 6 6" />),
  car: () => svg(<><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v3H3z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /><path d="M5 11h14" /></>),
  flame: () => svg(<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6 1 2.6 2 3 0-3 .3-5.6.8-8.2z" />, true),
  speaker: () => svg(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>),
  phone: () => svg(<path d="M6.6 3.5l2.6.4 1.3 4-2 1.6a12 12 0 0 0 6 6l1.6-2 4 1.3.4 2.6a2 2 0 0 1-2 2.1A17 17 0 0 1 4.5 5.5a2 2 0 0 1 2.1-2z" />),
  lock: () => svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  out: () => svg(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  download: () => svg(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />),
  upload: () => svg(<path d="M12 20V9M7 14l5-5 5 5M5 4h14" />),
  dots: () => svg(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>, true),
}

/** The Fontaine fleur-de-lis (same drawing as the app icon). */
export function Fleur({ size = 22 }: { size?: number }) {
  return (
    <svg class="crest" style={{ width: size, height: size }} viewBox="0 0 100 92" fill="currentColor" role="img" aria-label="Fleur-de-lis">
      <path d="M50 2 C67 20 68 42 50 62 C32 42 33 20 50 2 Z" />
      <path d="M46 58 C29 63 10 54 11 38 C12 25 30 22 34 33 C37 42 30 46 26 42 C28 52 38 54 47 50 Z" />
      <path d="M54 58 C71 63 90 54 89 38 C88 25 70 22 66 33 C63 42 70 46 74 42 C72 52 62 54 53 50 Z" />
      <rect x="28" y="59" width="44" height="9" rx="4" />
      <path d="M43 67 L36 90 C45 86 49 79 50 73 C51 79 55 86 64 90 L57 67 Z" />
    </svg>
  )
}

function useEscape(onClose: () => void) {
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}

/** Slides up from the bottom; tap outside or ✕ to close. */
export function Sheet({ title, children, onClose = close }: { title: string; children: ComponentChildren; onClose?: () => void }) {
  useEscape(onClose)
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head"><span class="grabber" /><div class="between"><h2 class="h2">{title}</h2><button class="iconbtn ring press" aria-label="Close" onClick={onClose}><Icon.x /></button></div></div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button class={`switch press${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

export function Seg<T extends string | number>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  return <div class="seg" role="group" aria-label={label}>{options.map(([v, l]) => <button class={value === v ? 'on press' : 'press'} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>
}

export function Spinner() { return <span class="spinner" aria-hidden="true" /> }

export const fmtDate = (t: number) => new Date(t).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
