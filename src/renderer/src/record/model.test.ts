import { describe, expect, it } from 'vitest'
import { failureOf, formatElapsed, toRead } from './model'

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
