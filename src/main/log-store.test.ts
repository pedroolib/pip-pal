import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { CheckIn } from '@shared/schemas'
import checkInsJson from '@shared/fixtures/week.checkins.json'
import { createLogStore } from './log-store'

const one: CheckIn = { at: '2026-11-02T09:00:00-06:00', slot: 'morning', spoons: 2 }

let file: string
beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'pip-')), 'checkins.json')
})

describe('log store', () => {
  it('seeds the file on first run', () => {
    const items = createLogStore(file, CheckIn, checkInsJson).list()
    expect(items).toHaveLength(checkInsJson.length)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(checkInsJson.length)
  })

  it('keeps what was added across stores, after the seed', () => {
    createLogStore(file, CheckIn, checkInsJson).add(one)
    const items = createLogStore(file, CheckIn, checkInsJson).list()
    expect(items).toHaveLength(checkInsJson.length + 1)
    expect(items.at(-1)).toEqual(one)
  })

  it('rejects an invalid item and leaves the file untouched', () => {
    const store = createLogStore(file, CheckIn)
    store.add(one)
    const before = readFileSync(file, 'utf8')
    expect(() => store.add({ ...one, spoons: 9 })).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it.each([['not json ['], ['[{"spoons":1}]']])('backs up %s and starts empty', (bad) => {
    writeFileSync(file, bad)
    expect(createLogStore(file, CheckIn, checkInsJson).list()).toEqual([])
    const bak = readdirSync(dirname(file)).find((f) => f.endsWith('.bak'))!
    expect(readFileSync(join(dirname(file), bak), 'utf8')).toBe(bad)
  })

  it('does not seed over a path it cannot read', () => {
    mkdirSync(file)
    expect(() => createLogStore(file, CheckIn, checkInsJson).list()).toThrow()
    expect(statSync(file).isDirectory()).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('writes the file owner-only', () => {
    createLogStore(file, CheckIn).add(one)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})
