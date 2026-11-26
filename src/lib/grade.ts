// Grading a spoken review answer on the phone (instant, free): accents, punctuation, "¿¡" and
// filler words don't matter; small recognition slips are forgiven.

export const norm = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"“”«»()…'’-]/g, ' ')
    .replace(/\b(eh|em|este|pues|bueno|mmm|um|uh)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()

export function distance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

export const similarity = (a: string, b: string) => {
  const x = norm(a), y = norm(b)
  if (!x && !y) return 1
  return 1 - distance(x, y) / Math.max(x.length, y.length)
}

/** Words of the answer that must be there (verbs and nouns carry the meaning). */
const optional = new Set(['por', 'favor', 'usted', 'yo', 'el', 'la', 'los', 'las', 'un', 'una', 'y'])

export type Grade = 'right' | 'close' | 'wrong'

export function grade(heard: string, answer: string, alts: string[] = []): Grade {
  const h = norm(heard)
  if (!h) return 'wrong'
  let best = 0
  for (const a of [answer, ...alts]) {
    const s = similarity(h, a)
    // Saying the answer inside a longer sentence also counts ("la palabra es nadar").
    const words = norm(a).split(' ').filter((w) => !optional.has(w))
    const all = words.length > 0 && words.every((w) => h.split(' ').some((x) => x === w || (w.length > 4 && distance(x, w) <= 1)))
    best = Math.max(best, all ? Math.max(s, 0.86) : s)
  }
  return best >= 0.85 ? 'right' : best >= 0.65 ? 'close' : 'wrong'
}

export const wordCount = (s: string) => norm(s).split(' ').filter(Boolean).length
