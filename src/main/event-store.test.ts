import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import eventsJson from '@shared/fixtures/week.events.json'
import { createEventStore } from './event-store'

const NOW = new Date('2026-11-03T12:00:00-06:00')
const now = (): Date => NOW
const daysAgo = (d: number): string => new Date(NOW.getTime() - d * 86_400_000).toISOString()

let file: string
beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'pip-')), 'events.json')
})

describe('event store', () => {
  it('seeds the file on first run', () => {
    expect(createEventStore(file, eventsJson, now).list()).toHaveLength(eventsJson.length)
  })

  it('assigns id and at in main', () => {
    const store = createEventStore(file, [], now)
    store.addFromRenderer({ kind: 'calm', status: 'used', strategyId: 'music', id: 'x', at: 'y' })
    const [e] = store.list()
    expect(e.id).not.toBe('x')
    expect(e.id.length).toBeGreaterThan(8)
    expect(e.at).toBe(NOW.toISOString())
  })

  it.each([
    { kind: 'decoded', text: 'hi', isChange: 0, changeType: 'none', isNewTask: 0, tone: 'neutral' },
    { kind: 'action', action: 'steps' },
    { kind: 'asked', topic: 'nope', question: 'Dana Quillfeather secret?' },
    'Dana Quillfeather secret',
    null
  ])('rejects renderer input %j without echoing it', (bad) => {
    const store = createEventStore(file, [], now)
    let message = ''
    try {
      store.addFromRenderer(bad)
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toMatch(/event/i)
    expect(message).not.toMatch(/Quillfeather|decoded|action/)
    expect(store.list()).toEqual([])
  })

  it('lets main log decoded and action', () => {
    const store = createEventStore(file, [], now)
    store.add({ kind: 'action', action: 'questions' })
    expect(store.list()).toMatchObject([{ kind: 'action', action: 'questions' }])
  })

  it('prunes events older than 90 days on read and on write', () => {
    const old = { id: 'old', at: daysAgo(91), kind: 'action', action: 'steps' }
    const fresh = { id: 'fresh', at: daysAgo(89), kind: 'action', action: 'steps' }
    writeFileSync(file, JSON.stringify([old, fresh]))
    const store = createEventStore(file, [], now)
    expect(store.list().map((e) => e.id)).toEqual(['fresh'])
    store.add({ kind: 'action', action: 'transition' })
    expect(JSON.parse(readFileSync(file, 'utf8')).map((e: { id: string }) => e.id)).not.toContain(
      'old'
    )
  })

  it('deletes one event and all events', () => {
    const store = createEventStore(file, eventsJson, now)
    store.remove('ev-01')
    expect(store.list().map((e) => e.id)).not.toContain('ev-01')
    expect(store.list()).toHaveLength(eventsJson.length - 1)
    store.clear()
    expect(createEventStore(file, eventsJson, now).list()).toEqual([])
  })

  it('clear removes every backup and leftover tmp; retention prunes old backups', () => {
    const dir = dirname(file)
    const since = NOW.getTime() - 90 * 86_400_000
    const old = `${file}.${since - 1000}.bak`
    const recent = `${file}.${since + 1000}.bak`
    for (const f of [old, recent, file + '.tmp']) writeFileSync(f, 'Dana secret')
    const store = createEventStore(file, [], now)
    store.list()
    expect(readdirSync(dir).sort()).toEqual(['events.json', `events.json.${since + 1000}.bak`])
    writeFileSync(file + '.tmp', 'Dana secret') // a crash mid-write
    store.clear()
    expect(readdirSync(dir)).toEqual(['events.json'])
  })

  it('rejects a non-string id', () => {
    const store = createEventStore(file, eventsJson, now)
    expect(() => store.remove(42 as never)).toThrow()
    expect(store.list()).toHaveLength(eventsJson.length)
  })
})
