import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { Profile } from '@shared/schemas'
import { createProfileStore } from './profile-store'

let file: string
beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'pip-')), 'profile.json')
})

describe('profile store', () => {
  it('seeds from the fixture when the file is missing, with ids', () => {
    const p = createProfileStore(file).load()
    expect(existsSync(file)).toBe(true)
    expect(p.sections.communication.length).toBeGreaterThan(0)
    expect(
      Object.values(p.sections)
        .flat()
        .every((e) => e.id)
    ).toBe(true)
  })

  it('round-trips a saved profile', () => {
    const store = createProfileStore(file)
    const p = store.load()
    p.sections.communication[0].text = 'edited'
    store.save(p)
    expect(createProfileStore(file).load().sections.communication[0].text).toBe('edited')
    expect(existsSync(file + '.tmp')).toBe(false)
  })

  it('rejects an invalid save and leaves the file untouched', () => {
    const store = createProfileStore(file)
    store.load()
    const before = readFileSync(file, 'utf8')
    expect(() => store.save({ nope: 1 } as unknown as Profile)).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it.each([['not json {'], ['{"name":1}']])(
    'keeps a .bak and re-seeds on corrupt file %s',
    (bad) => {
      writeFileSync(file, bad)
      const p = createProfileStore(file).load()
      expect(readFileSync(file + '.bak', 'utf8')).toBe(bad)
      expect(p.sections.communication.length).toBeGreaterThan(0)
      expect(() => Profile.parse(JSON.parse(readFileSync(file, 'utf8')))).not.toThrow()
    }
  )
})
