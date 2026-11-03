import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import samJson from '@shared/fixtures/sam.profile.json'
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

  it('keeps ids stable across loads', () => {
    const ids = (p: Profile): (string | undefined)[] =>
      Object.values(p.sections)
        .flat()
        .map((e) => e.id)
    const store = createProfileStore(file)
    expect(ids(store.load())).toEqual(ids(store.load()))
  })

  it('returns the parsed profile when persisting new ids fails, and save still throws', () => {
    const store = createProfileStore(file)
    const p = store.load()
    delete p.sections.communication[0].id
    writeFileSync(file, JSON.stringify(p))
    mkdirSync(file + '.tmp') // makes every write fail
    const loaded = store.load()
    expect(loaded.sections.communication[0].id).toBeTruthy()
    expect(readdirSync(dirname(file)).some((f) => f.endsWith('.bak'))).toBe(false)
    expect(() => store.save(loaded)).toThrow()
  })

  it('keeps only the 3 newest backups', () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(file, `corrupt ${i}`)
      createProfileStore(file).load()
    }
    const baks = readdirSync(dirname(file)).filter((f) => f.endsWith('.bak'))
    expect(baks).toHaveLength(3)
    expect(baks.sort().map((f) => readFileSync(join(dirname(file), f), 'utf8'))).toEqual([
      'corrupt 2',
      'corrupt 3',
      'corrupt 4'
    ])
  })

  it('does not seed over a path it cannot read', () => {
    mkdirSync(file) // reading a directory fails with EISDIR, not ENOENT
    expect(() => createProfileStore(file).load()).toThrow()
    expect(statSync(file).isDirectory()).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('writes the file owner-only', () => {
    createProfileStore(file).load()
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('seeds the given profile instead of Sam (a real first run starts empty)', () => {
    const empty = { ...samJson, people: [], calmingStrategies: [], name: '', role: '' }
    expect(createProfileStore(file, empty).load()).toMatchObject({ name: '', people: [] })
  })

  it('renames the old origins (coach, pip) instead of re-seeding', () => {
    const old = JSON.parse(JSON.stringify(samJson))
    old.name = 'Kept'
    old.sections.communication[0].origin = 'coach'
    old.calmingStrategies[0].origin = 'pip'
    old.pending = [
      { id: 'p', key: 'k', why: 'w', section: 'energy', text: 't', origin: 'pip', visibleTo: [] }
    ]
    writeFileSync(file, JSON.stringify(old))
    const p = createProfileStore(file).load()
    expect(p.name).toBe('Kept')
    expect(p.sections.communication[0].origin).toBe('onboarding')
    expect(p.calmingStrategies[0].origin).toBe('learned')
    expect(p.pending?.[0].origin).toBe('learned')
    expect(readdirSync(dirname(file)).some((f) => f.endsWith('.bak'))).toBe(false)
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
      const bak = readdirSync(dirname(file)).find((f) => f.endsWith('.bak'))!
      expect(readFileSync(join(dirname(file), bak), 'utf8')).toBe(bad)
      expect(p.sections.communication.length).toBeGreaterThan(0)
      expect(() => Profile.parse(JSON.parse(readFileSync(file, 'utf8')))).not.toThrow()
    }
  )
})
