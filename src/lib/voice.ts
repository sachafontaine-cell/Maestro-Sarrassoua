// Which voice and speed to use, from Settings (the one place they're changed).
import { settings, setSettings } from './data'
import { bestVoice, type SayOpts, type VoiceLang } from './speech'
import type { StageId } from './model'
import { clampRate } from './commands'

export const stageLang = (stage: StageId): VoiceLang => (stage === 1 ? 'es-MX' : 'es-CO')

export function sayOpts(stage: StageId, lang: 'es' | 'en', mult = 1): SayOpts {
  const s = settings.get()
  if (lang === 'en') return { lang: 'en-US', voice: bestVoice('en-US', s.voiceEn), rate: 1 }
  const l = stageLang(stage)
  return { lang: l, voice: bestVoice(l, stage === 1 ? s.voiceMx : s.voiceCo), rate: clampRate(s.rate * mult) }
}

/** "más despacio" / "más rápido" change the same speed setting as Settings. */
export function nudgeRate(delta: number) { setSettings({ rate: clampRate(settings.get().rate + delta) }) }
