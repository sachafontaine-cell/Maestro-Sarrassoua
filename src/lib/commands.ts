// Voice commands that work any time, hands-free included. Only a short utterance counts, so
// "voy a terminar la cocina" is Spanish practice, not "end".
import { norm } from './grade'

export type Command = 'repeat' | 'slower' | 'faster' | 'english' | 'end'

const RULES: [Command, RegExp][] = [
  ['repeat', /^(repite|repita|repitelo|repitalo|repitemelo|repitamelo|otra vez|de nuevo|repeat|repeat that)$/],
  ['slower', /^(mas despacio|despacio|mas lento|mas lentamente|habla mas despacio|hable mas despacio|slower|slow down)$/],
  ['faster', /^(mas rapido|mas rapidamente|faster)$/],
  ['english', /^(en ingles|ingles|in english|explicalo en ingles|expliquelo en ingles|explain in english)$/],
  ['end', /^(terminar|termina|termine|terminamos|vamos a terminar|fin|stop|end|end session)$/],
]

export function command(heard: string): Command | null {
  const t = norm(heard).replace(/\b(por favor|please|ok|okay|ya)\b/g, '').replace(/\s+/g, ' ').trim()
  if (!t || t.split(' ').length > 4) return null
  for (const [c, r] of RULES) if (r.test(t)) return c
  return null
}

export const RATE_STEP = 0.1
export const RATE_MIN = 0.6
export const RATE_MAX = 1.3
export const clampRate = (r: number) => Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, r)) * 100) / 100
