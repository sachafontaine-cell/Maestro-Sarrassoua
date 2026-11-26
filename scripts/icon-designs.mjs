// The app icon. Navy and gold like the other Fontaine apps, with the family fleur-de-lis
// (same drawing as the Control Center icon) small on it.
export const NAVY = '#0D235A', GOLD = '#E0A21C', GOLD_DARK = '#B5850F', CREAM = '#F7F3EA'

const FLEUR = `<path d="M50 2 C67 20 68 42 50 62 C32 42 33 20 50 2 Z"/>
  <path d="M46 58 C29 63 10 54 11 38 C12 25 30 22 34 33 C37 42 30 46 26 42 C28 52 38 54 47 50 Z"/>
  <path d="M54 58 C71 63 90 54 89 38 C88 25 70 22 66 33 C63 42 70 46 74 42 C72 52 62 54 53 50 Z"/>
  <rect x="28" y="59" width="44" height="9" rx="4"/>
  <path d="M43 67 L36 90 C45 86 49 79 50 73 C51 79 55 86 64 90 L57 67 Z"/>`
/** A fleur-de-lis `w` px wide, centered on (cx, cy). */
export const fleur = (cx, cy, w, fill) => { const k = w / 100; return `<g transform="translate(${cx - 50 * k} ${cy - 46 * k}) scale(${k})" fill="${fill}">${FLEUR}</g>` }

export const DESIGNS = {
  // Two speech bubbles in conversation: a gold one (the tutor) and a cream one (you), with
  // sound waves between them; the fleur-de-lis sits small in the cream bubble.
  bubbles: (s = 1) => `<g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <path d="M86 112 h228 a40 40 0 0 1 40 40 v108 a40 40 0 0 1 -40 40 h-150 l-58 50 l10 -50 h-30 a40 40 0 0 1 -40 -40 v-108 a40 40 0 0 1 40 -40 z" fill="${GOLD}"/>
    <path d="M86 112 h228 a40 40 0 0 1 40 40 v20 h-308 v-20 a40 40 0 0 1 40 -40 z" fill="${GOLD_DARK}" opacity=".35"/>
    <path d="M136 208 v24 M168 192 v56 M200 200 v40 M232 186 v68 M264 202 v36" stroke="${NAVY}" stroke-width="16" stroke-linecap="round"/>
    <path d="M238 244 h192 a36 36 0 0 1 36 36 v92 a36 36 0 0 1 -36 36 h-22 l8 46 l-54 -46 h-124 a36 36 0 0 1 -36 -36 v-92 a36 36 0 0 1 36 -36 z" fill="${CREAM}" stroke="${NAVY}" stroke-width="14"/>
    ${fleur(334, 326, 84, NAVY)}
  </g>`,
}

/** Full-bleed square (Android crops it), so no white border ever appears. */
export const icon = (name, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${NAVY}"/>${DESIGNS[name](scale)}</svg>`
