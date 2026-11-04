import { describe, expect, it } from 'vitest'
import { errorFor } from './formError'

const wrapped = (m: string): Error =>
  new Error(`Error invoking remote method 'reminder:save': Error: ${m}`)

describe('errorFor', () => {
  it.each([
    ['REMINDER_PAST A reminder must be in the future.', 'errorPast'],
    ['REMINDER_LONG A reminder is too long.', 'errorLong'],
    ['REMINDER_FULL Too many reminders.', 'errorFull']
  ])('reads %s through the IPC wrapper', (message, key) => {
    expect(errorFor(wrapped(message))).toBe(key)
  })

  it.each([
    'ENOSPC: disk full, write',
    'no space left on device: limit reached',
    'A reminder is not valid.',
    'could not write 200 characters'
  ])('never reads %s as a limit', (message) => {
    expect(errorFor(wrapped(message))).toBe('errorGeneric')
  })

  it('is generic for something that is not an error', () => {
    expect(errorFor('nope')).toBe('errorGeneric')
  })
})
