import { describe, expect, it } from 'vitest'
import {
  dictateFailure,
  failureOf,
  formatElapsed,
  insertAt,
  isCantHear,
  ownsEnter,
  toRead
} from './model'

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

describe('insertAt', () => {
  it('adds after the cursor, spaced, and never drops what was typed', () => {
    expect(insertAt('Hello', 'world', 5)).toEqual({ value: 'Hello world', caret: 11 })
    expect(insertAt('', ' hi ', 0)).toEqual({ value: 'hi', caret: 2 })
    expect(insertAt('ab cd', 'X', 2)).toEqual({ value: 'abX cd'.replace('X', ' X'), caret: 4 })
    expect(insertAt('Hello ', 'there', 6).value).toBe('Hello there')
  })
  it('cuts to the field limit and ignores empty text', () => {
    expect(insertAt('abc', 'defgh', 3, 6).value).toBe('abc de')
    expect(insertAt('abc', '  ', 3).value).toBe('abc')
    expect(insertAt('abcdef', 'x', 6, 6).value).toBe('abcdef')
  })
})

describe('dictateFailure', () => {
  it('tells a refused or missing mic from transcription trouble', () => {
    expect(dictateFailure(new DOMException('x', 'NotAllowedError'))).toBe('denied')
    expect(dictateFailure(new DOMException('x', 'NotFoundError'))).toBe('noMic')
    expect(dictateFailure(new Error("I didn't hear any words."))).toBe('empty')
  })
})
