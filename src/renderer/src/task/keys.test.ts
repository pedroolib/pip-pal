import { describe, expect, it } from 'vitest'
import { splitKeys } from './keys'

describe('splitKeys', () => {
  it('finds a shortcut with spaces around the plus', () => {
    expect(splitKeys('Click C2, then press Ctrl + V')).toEqual([
      { text: 'Click C2, then press ' },
      { keys: ['Ctrl', 'V'] }
    ])
  })

  it('finds several shortcuts and upper-cases single letters', () => {
    expect(splitKeys('Cmd+c to copy and Cmd+Shift+t to reopen.')).toEqual([
      { keys: ['Cmd', 'C'] },
      { text: ' to copy and ' },
      { keys: ['Cmd', 'Shift', 'T'] },
      { text: ' to reopen.' }
    ])
  })

  it('leaves text without a shortcut alone', () => {
    expect(splitKeys('Sync with Dana before Monday')).toEqual([
      { text: 'Sync with Dana before Monday' }
    ])
  })

  it('needs a modifier and a whole word', () => {
    expect(splitKeys('Plan A + B, and CtrlX+V')).toEqual([{ text: 'Plan A + B, and CtrlX+V' }])
    expect(splitKeys('Shift the meeting')).toEqual([{ text: 'Shift the meeting' }])
  })
})
