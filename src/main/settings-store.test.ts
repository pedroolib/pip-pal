import { mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '@shared/schemas'
import { createSettingsStore } from './settings-store'

let file: string
beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'pip-')), 'settings.json')
})

describe('settings store', () => {
  it('returns defaults when the file is missing', () => {
    expect(createSettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips saved settings', () => {
    const s: Settings = {
      checkIns: { morning: false, midday: true, afternoon: false },
      language: 'es',
      calmMotion: true
    }
    createSettingsStore(file).save(s)
    expect(createSettingsStore(file).load()).toEqual(s)
  })

  it('backs up a corrupt file and falls back to defaults', () => {
    writeFileSync(file, '{ nope')
    expect(createSettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
    expect(readdirSync(dirname(file)).some((f) => f.endsWith('.bak'))).toBe(true)
  })

  it('treats a wrong shape as corrupt, and rejects invalid saves', () => {
    writeFileSync(file, JSON.stringify({ language: 'fr' }))
    const store = createSettingsStore(file)
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
    expect(() => store.save({ ...DEFAULT_SETTINGS, language: 'fr' } as never)).toThrow()
  })
})
