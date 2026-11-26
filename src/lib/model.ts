// What the app keeps on the phone.

export type MistakeType = 'verb' | 'vocab' | 'gender' | 'french' | 'listening'
export const MISTAKE_TYPES: MistakeType[] = ['verb', 'vocab', 'gender', 'french', 'listening']
export const TYPE_LABEL: Record<MistakeType, string> = {
  verb: 'Verb forms',
  vocab: 'Vocabulary',
  gender: 'Gender & agreement',
  french: 'French interference',
  listening: 'Listening',
}

export type StageId = 1 | 2
export type RegionId = 'bogota' | 'medellin' | 'cali' | 'costa' | 'santander'

export interface Settings {
  /** AI key (Gemini "AIza…" or Claude "sk-ant-…"): only on this phone, never in a backup, never logged. */
  apiKey?: string
  /** The Gemini model that answered last (tried first next time). */
  geminiModel?: string
  /** Base speaking rate of the tutor's voice (1 = normal). */
  rate: number
  handsFreeDefault: boolean
  /** Stage 2: where the Colombian friend is from. */
  region: RegionId
  /** Chosen voices by name (empty = the best one available). */
  voiceMx?: string
  voiceCo?: string
  voiceEn?: string
  /** Set by itself if the API ever refuses the full request shape (see claude.ts). */
  plainRequests?: boolean
}

export const defaultSettings = (): Settings => ({ rate: 0.9, handsFreeDefault: false, region: 'bogota' })

export interface Placement { at: number; level: number; label: string; summary: string; weak: MistakeType[]; scores?: Partial<Record<MistakeType, number>> }

export interface Profile {
  /** 1 = A1, 1.5 = A1+, 2 = A2, 2.5 = A2+, 3 = B1. */
  level: number
  stage: StageId
  stage2Unlocked: boolean
  /** The unlock banner was seen (Home shows it once). */
  unlockSeen: boolean
  placements: Placement[]
  /** Today's scenario (picked once a day, or changed on Home). */
  today?: { date: string; stage: StageId; scenario: string }
  seeded: boolean
}

export const defaultProfile = (): Profile => ({ level: 1.5, stage: 1, stage2Unlocked: false, unlockSeen: false, placements: [], seeded: false })

export interface Mistake {
  id: string
  at: number
  session: string
  stage: StageId
  type: MistakeType
  said: string
  fix: string
  why: string
  big: boolean
}

export interface Fix { type: MistakeType; said: string; fix: string; why: string }
export interface Word { es: string; en: string }

export interface SessionRec {
  id: string
  at: number
  stage: StageId
  scenario: string
  handsFree: boolean
  minutes: number
  /** Learner turns in the role-play. */
  turns: number
  myWords: number
  tutorWords: number
  reviewed: number
  reviewOk: number
  mistakes: number
  big: number
  /** "repite", "más despacio", "en inglés" used. */
  asks: number
  fixes: Fix[]
  words: Word[]
  level?: string
  note?: string
  completed: boolean
}

export interface Card {
  id: string
  /** What the learner is asked (English): "How do you say: …?" */
  cue: string
  answer: string
  alts: string[]
  type: MistakeType
  source: 'seed' | 'mistake' | 'word' | 'placement'
  created: number
  due: number
  /** Successful reviews in a row (0–5). 5 = remembered after a month. */
  step: number
  reps: number
  lapses: number
  last?: { at: number; ok: boolean; heard: string }
}

export interface Usage {
  id: string
  at: number
  session?: string
  kind: 'turn' | 'recap' | 'placement' | 'check'
  model: string
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  usd: number
}
