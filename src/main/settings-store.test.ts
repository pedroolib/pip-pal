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
      checkIns: [
        { id: 'a', time: '08:15', enabled: false },
        { id: 'b', time: '12:00', enabled: true }
      ],
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

  it('converts the old morning/midday/afternoon switches to the default times', () => {
    writeFileSync(
      file,
      JSON.stringify({
        checkIns: { morning: true, midday: false, afternoon: true },
        language: 'es',
        calmMotion: true
      })
    )
    expect(createSettingsStore(file).load()).toEqual({
      checkIns: [
        { id: 'morning', time: '09:00', enabled: true },
        { id: 'midday', time: '13:00', enabled: false },
        { id: 'afternoon', time: '17:00', enabled: true }
      ],
      language: 'es',
      calmMotion: true
    })
    expect(readdirSync(dirname(file)).some((f) => f.endsWith('.bak'))).toBe(false)
  })

  it('rejects duplicate or more than six times', () => {
    const store = createSettingsStore(file)
    const t = (time: string, i = 0): Settings['checkIns'][number] => ({
      id: `${i}`,
      time,
      enabled: true
    })
    expect(() =>
      store.save({ ...DEFAULT_SETTINGS, checkIns: [t('09:00'), t('09:00', 1)] })
    ).toThrow()
    const seven = ['01', '02', '03', '04', '05', '06', '07'].map((h, i) => t(`${h}:00`, i))
    expect(() => store.save({ ...DEFAULT_SETTINGS, checkIns: seven })).toThrow()
    expect(() => store.save({ ...DEFAULT_SETTINGS, checkIns: [t('9:00')] })).toThrow()
  })

  it('treats a wrong shape as corrupt, and rejects invalid saves', () => {
    writeFileSync(file, JSON.stringify({ language: 'fr' }))
    const store = createSettingsStore(file)
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
    expect(() => store.save({ ...DEFAULT_SETTINGS, language: 'fr' } as never)).toThrow()
  })
})
