import { describe, expect, it } from 'vitest'
import { toClassification } from './jev-questions'

const answers = {
  isChange: { noul: 0.91 },
  changeType: { choice: 'leader' as const },
  tone: { choice: 'friendly' as const },
  urgency: { probabilities: { '0': 0.05, '1': 0.1, '2': 0.2, '3': 0.6, '4': 0.05 } },
  isAmbiguous: { noul: 0.42 }
}

describe('toClassification', () => {
  it('passes probabilities through unchanged and reads the top choices', () => {
    expect(toClassification(answers)).toEqual({
      isChange: 0.91,
      changeType: 'leader',
      tone: 'friendly',
      urgency: 4,
      isAmbiguous: 0.42
    })
  })

  it("maps a clear no on isChange to changeType 'none'", () => {
    const out = toClassification({ ...answers, isChange: { noul: 0.12 } })
    expect(out.changeType).toBe('none')
    expect(out.isChange).toBe(0.12)
  })

  it('keeps the best-guess type when isChange is unsettled', () => {
    expect(toClassification({ ...answers, isChange: { noul: 0.5 } }).changeType).toBe('leader')
  })

  it('reads urgency from the most likely level, not the pulled-to-the-middle average', () => {
    const twoPeaks = { '0': 0.46, '1': 0.02, '2': 0.03, '3': 0.05, '4': 0.44 }
    expect(toClassification({ ...answers, urgency: { probabilities: twoPeaks } }).urgency).toBe(1)
  })
})
