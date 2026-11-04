import { mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REMINDER_MAX, Reminder } from '@shared/schemas'
import { createLogStore } from './log-store'
import { deleteReminder, saveReminder, startReminderSchedule } from './reminders'

const NOW = new Date('2026-11-03T12:00:00Z')
const MINUTE = 60_000
const DAY = 86_400_000
const inMs = (ms: number): string => new Date(NOW.getTime() + ms).toISOString()
const reminder = (id: string, ms: number, text = id): Reminder => ({ id, text, at: inMs(ms) })

describe('startReminderSchedule', () => {
  let reminders: Reminder[]
  let due: string[]
  let stop: () => void
  const start = (): ReturnType<typeof startReminderSchedule> => {
    const s = startReminderSchedule({
      list: () => reminders,
      onDue: (r) => due.push(r.id)
    })
    stop = s.stop
    return s
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    reminders = []
    due = []
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('fires at its time, not before, and only once', () => {
    reminders = [reminder('a', 15 * MINUTE)]
    start()
    vi.advanceTimersByTime(15 * MINUTE - 1)
    expect(due).toEqual([])
    vi.advanceTimersByTime(1)
    expect(due).toEqual(['a'])
    vi.advanceTimersByTime(DAY)
    expect(due).toEqual(['a'])
  })

  it('fires each in turn when several are ahead', () => {
    reminders = [reminder('later', 2 * MINUTE), reminder('sooner', MINUTE)]
    start()
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['sooner'])
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['sooner', 'later'])
  })

  it('never arms a delay setTimeout would overflow on', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    reminders = [reminder('far', 30 * DAY)]
    start()
    expect(spy.mock.calls.at(-1)?.[1]).toBe(2 ** 31 - 1)
    spy.mockRestore()
  })

  it('fires correctly more than 24.8 days ahead', () => {
    reminders = [reminder('far', 60 * DAY)]
    start()
    vi.advanceTimersByTime(60 * DAY - 1)
    expect(due).toEqual([])
    vi.advanceTimersByTime(1)
    expect(due).toEqual(['far'])
  })

  it('fires what came due while closed at start, oldest first', () => {
    reminders = [reminder('new', -MINUTE), reminder('old', -DAY), reminder('ahead', MINUTE)]
    start()
    expect(due).toEqual(['old', 'new'])
  })

  it('fires on wake what came due during sleep', () => {
    reminders = [reminder('a', MINUTE)]
    const s = start()
    vi.setSystemTime(new Date(NOW.getTime() + DAY)) // slept: the timer never ran
    s.refresh()
    s.refresh()
    expect(due).toEqual(['a'])
  })

  it('fires again when its time moves, but not when nothing changed', () => {
    reminders = [reminder('a', -MINUTE)]
    const s = start()
    s.refresh()
    expect(due).toEqual(['a'])
    reminders = [reminder('a', MINUTE)] // Later
    s.refresh()
    expect(due).toEqual(['a'])
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['a', 'a'])
  })

  it('does not fire a deleted reminder', () => {
    reminders = [reminder('a', MINUTE)]
    const s = start()
    reminders = []
    s.refresh()
    vi.advanceTimersByTime(DAY)
    expect(due).toEqual([])
  })

  it('fires an edited reminder at the new time, not the old one', () => {
    reminders = [reminder('a', MINUTE)]
    const s = start()
    reminders = [reminder('a', 3 * MINUTE)]
    s.refresh()
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual([])
    vi.advanceTimersByTime(2 * MINUTE)
    expect(due).toEqual(['a'])
  })

  it('picks up an earlier reminder saved after the timer was armed', () => {
    reminders = [reminder('later', DAY)]
    const s = start()
    reminders = [...reminders, reminder('soon', MINUTE)]
    s.refresh()
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['soon'])
  })

  it('holds reminders while the list is empty (overlay not loaded, onboarding), then fires them', () => {
    const s = start()
    vi.setSystemTime(new Date(NOW.getTime() + MINUTE))
    reminders = [reminder('a', 0)]
    s.refresh()
    expect(due).toEqual(['a'])
  })

  it('sends overdue reminders again for a reloaded overlay, future ones at their time', () => {
    reminders = [reminder('a', -MINUTE), reminder('b', MINUTE)]
    const s = start()
    expect(due).toEqual(['a'])
    s.redeliver()
    expect(due).toEqual(['a', 'a'])
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['a', 'a', 'b'])
  })

  it('survives a list that throws, and tries again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = vi.fn((): Reminder[] => {
      throw new Error('EBUSY')
    })
    stop = startReminderSchedule({ list, onDue: (r) => due.push(r.id) }).stop
    list.mockImplementation(() => [reminder('a', -MINUTE)])
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['a'])
    warn.mockRestore()
  })

  it('tries again when sending fails, so the reminder is not lost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reminders = [reminder('a', -MINUTE)]
    let broken = true
    stop = startReminderSchedule({
      list: () => reminders,
      onDue: (r) => {
        if (broken) throw new Error('window gone')
        due.push(r.id)
      }
    }).stop
    broken = false
    vi.advanceTimersByTime(MINUTE)
    expect(due).toEqual(['a'])
    warn.mockRestore()
  })
})

describe('saving and deleting', () => {
  const open = (): ReturnType<typeof createLogStore<Reminder>> =>
    createLogStore(join(mkdtempSync(join(tmpdir(), 'pip-')), 'reminders.json'), Reminder)

  it('adds a new one and survives reopening the file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pip-')), 'reminders.json')
    saveReminder(createLogStore(file, Reminder), reminder('a', MINUTE), NOW)
    expect(createLogStore(file, Reminder).list()).toEqual([reminder('a', MINUTE)])
  })

  it('updates the one with the same id', () => {
    const store = open()
    saveReminder(store, reminder('a', MINUTE), NOW)
    saveReminder(store, reminder('a', 2 * MINUTE, 'new words'), NOW)
    expect(store.list()).toEqual([reminder('a', 2 * MINUTE, 'new words')])
  })

  it.each([
    ['not an object', 'hello'],
    ['no id', { text: 'x', at: inMs(MINUTE) }],
    ['empty text', { id: 'a', text: '', at: inMs(MINUTE) }],
    ['blank text', { id: 'a', text: '   ', at: inMs(MINUTE) }],
    ['text too long', { id: 'a', text: 'x'.repeat(501), at: inMs(MINUTE) }],
    ['a bad time', { id: 'a', text: 'x', at: 'tomorrow' }]
  ])('rejects %s and stores nothing', (_, input) => {
    const store = open()
    expect(() => saveReminder(store, input, NOW)).toThrow()
    expect(store.list()).toEqual([])
  })

  it('rejects past the limit, but still lets one be edited at the limit', () => {
    const store = open()
    const full = Array.from({ length: REMINDER_MAX }, (_, i) => reminder(`r${i}`, MINUTE))
    store.replace(full)
    expect(() => saveReminder(store, reminder('one-more', MINUTE), NOW)).toThrow(/too many/i)
    expect(store.list()).toHaveLength(REMINDER_MAX)
    saveReminder(store, reminder('r0', 2 * MINUTE), NOW)
    expect(store.list()[0]).toEqual(reminder('r0', 2 * MINUTE))
  })

  it('allows up to 5 s in the past for clock skew, not more', () => {
    const store = open()
    saveReminder(store, reminder('skew', -5000), NOW)
    expect(() => saveReminder(store, reminder('past', -5001), NOW)).toThrow(/future/i)
    expect(store.list().map((r) => r.id)).toEqual(['skew'])
  })

  it('lets the words of an overdue reminder change, but not its time move into the past', () => {
    const store = open()
    store.replace([reminder('a', -DAY)])
    saveReminder(store, reminder('a', -DAY, 'new words'), NOW)
    expect(store.list()[0].text).toBe('new words')
    expect(() => saveReminder(store, reminder('a', -MINUTE), NOW)).toThrow(/future/i)
  })

  it('deletes by id and ignores an unknown one', () => {
    const store = open()
    store.replace([reminder('a', MINUTE), reminder('b', MINUTE)])
    deleteReminder(store, 'a')
    deleteReminder(store, 'nobody')
    expect(store.list().map((r) => r.id)).toEqual(['b'])
  })

  it('rejects a delete without an id', () => {
    const store = open()
    store.replace([reminder('a', MINUTE)])
    expect(() => deleteReminder(store, 42)).toThrow()
    expect(store.list()).toHaveLength(1)
  })

  it('starts empty from a corrupt file, keeps a backup, and saves again', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pip-')), 'reminders.json')
    writeFileSync(file, 'not json [')
    const store = createLogStore(file, Reminder)
    saveReminder(store, reminder('a', MINUTE), NOW)
    expect(store.list().map((r) => r.id)).toEqual(['a'])
    expect(readdirSync(dirname(file)).some((f) => f.endsWith('.bak'))).toBe(true)
  })
})
