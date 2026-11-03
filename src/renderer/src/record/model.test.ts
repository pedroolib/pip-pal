import { describe, expect, it } from 'vitest'
import { failureOf, formatElapsed, isCantHear, ownsEnter, toRead } from './model'

describe('formatElapsed', () => {
  it('shows minutes and seconds, padded', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(192_400)).toBe('03:12')
    expect(formatElapsed(600_000)).toBe('10:00')
  })
})

describe('toRead', () => {
  const text = 'Sam, send the numbers to Dana.'
  it('is the selection when there is one, else all the text', () => {
    expect(toRead(text, 5, 9)).toBe('send')
    expect(toRead(text, 7, 7)).toBe(text)
  })
})

describe('failureOf', () => {
  it('maps main errors, wrapped by IPC, to the calm cards', () => {
    const ipc = (m: string): Error =>
      new Error(`Error invoking remote method 'pip:transcribe': Error: ${m}`)
    expect(failureOf(ipc("I didn't hear any words."))).toBe('empty')
    expect(failureOf(ipc("The speech model isn't installed. Run npm run fetch:whisper."))).toBe(
      'noModel'
    )
    expect(failureOf(ipc('Transcription timed out.'))).toBe('error')
    expect(failureOf('weird')).toBe('error')
  })
})

describe('ownsEnter', () => {
  const el = (tagName: string, role: string | null = null): EventTarget =>
    ({ tagName, getAttribute: () => role }) as unknown as EventTarget
  it('lets a real button keep its Enter, but not a focused radio or other element', () => {
    expect(ownsEnter(el('BUTTON'))).toBe(true)
    expect(ownsEnter(el('BUTTON', 'radio'))).toBe(false)
    expect(ownsEnter(el('DIV', 'radiogroup'))).toBe(false)
    expect(ownsEnter(null)).toBe(false)
  })
})

describe('isCantHear', () => {
  it('maps a refused or unreadable computer-audio capture to the can-not-hear card', () => {
    expect(isCantHear(new DOMException('denied', 'NotAllowedError'))).toBe(true)
    expect(isCantHear(new DOMException('busy', 'NotReadableError'))).toBe(true)
    expect(isCantHear(new DOMException('bad', 'AbortError'))).toBe(false)
    expect(isCantHear(new Error('boom'))).toBe(false)
  })
})
