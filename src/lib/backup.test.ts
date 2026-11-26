import { describe, expect, it } from 'vitest'
import { makeBackup, readBackup, restoreBackup } from './backup'
import { cards, saveCards, setSettings, settings, sessions, saveSession } from './data'
import { newCard } from './srs'

describe('backup', () => {
  it('exports everything except the API key, and restores it', async () => {
    setSettings({ apiKey: 'sk-ant-secret', rate: 0.8 })
    saveCards([newCard({ cue: 'to swim', answer: 'nadar', type: 'french', source: 'seed' }, Date.now())])
    saveSession({ id: 's1', at: 1, stage: 1, scenario: 'tasks', handsFree: false, minutes: 15, turns: 9, myWords: 1, tutorWords: 1, reviewed: 0, reviewOk: 0, mistakes: 0, big: 0, asks: 0, fixes: [], words: [], completed: true })
    const b = makeBackup()
    const text = JSON.stringify(b)
    expect(text).not.toContain('sk-ant-secret')
    expect(b.cards.length).toBe(1)
    cards.set({})
    sessions.set({})
    setSettings({ rate: 1.2, apiKey: 'sk-ant-other' })
    const r = readBackup(JSON.parse(text))
    expect(r.ok).toBe(true)
    if (r.ok) await restoreBackup(r.data)
    expect(Object.keys(cards.get()).length).toBe(1)
    expect(sessions.get().s1.turns).toBe(9)
    expect(settings.get().rate).toBe(0.8)
    expect(settings.get().apiKey).toBe('sk-ant-other') // this phone's key is kept
  })
  it('refuses other files', () => {
    expect(readBackup({ app: 'chef-luc' }).ok).toBe(false)
    expect(readBackup({ app: 'hablemos', format: 2 }).ok).toBe(false)
    expect(readBackup({ app: 'hablemos', format: 1, sessions: [{}], mistakes: [], cards: [], usage: [], settings: {}, profile: {} }).ok).toBe(false)
  })
})
