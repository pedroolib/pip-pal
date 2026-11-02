import { describe, expect, it } from 'vitest'
import { findDateCandidates } from './dates'

const sunday = new Date(2026, 10, 1, 9, 0) // Sun 1 Nov 2026, local time
const wednesday = new Date(2026, 10, 4, 9, 0) // Wed 4 Nov 2026

const find = (text: string, now = sunday): Record<string, unknown>[] =>
  findDateCandidates(text, now).map((c) => ({ ...c }))

describe('findDateCandidates', () => {
  it('reads a start date as an inferred deadline', () => {
    expect(find('We are moving you to the forecasting project starting Monday.')).toEqual([
      { text: 'Monday', date: '2026-11-02', explicit: false }
    ])
    expect(find('A partir del lunes cambias de equipo.')[0]).toMatchObject({
      text: 'lunes',
      explicit: false
    })
  })

  it('resolves Spanish weekdays and relative days with times', () => {
    expect(find('Mándamelo el viernes, porfa.')).toEqual([
      { text: 'el viernes', date: '2026-11-06', explicit: true }
    ])
    expect(find('Nos vemos mañana a las 10 para revisarlo.')).toEqual([
      { text: 'mañana a las 10', date: '2026-11-02T10:00', explicit: true }
    ])
    expect(find('Llámame a las 5 de la tarde.')[0].date).toBe('2026-11-01T17:00')
    expect(find('Pasado mañana lo vemos.')[0].date).toBe('2026-11-03')
  })

  it('does not read "la mañana" (the morning) as tomorrow', () => {
    expect(find('Lo reviso por la mañana.')).toEqual([])
  })

  it('reads EOD as today and keeps ISO date-times', () => {
    expect(find('Need this EOD please')).toEqual([
      { text: 'EOD', date: '2026-11-01', explicit: true }
    ])
    expect(find('Can you send it by EOD Friday?')).toEqual([
      { text: 'EOD Friday', date: '2026-11-06', explicit: true }
    ])
    expect(find('Review at 2026-11-05 14:30 in room B')).toEqual([
      { text: '2026-11-05 14:30', date: '2026-11-05T14:30', explicit: true }
    ])
  })

  it('counts weeks from Monday for this/next', () => {
    const at = (t: string): unknown => find(t, wednesday)[0].date
    expect(at('next Monday')).toBe('2026-11-09')
    expect(at('Monday')).toBe('2026-11-09')
    expect(at('this Friday')).toBe('2026-11-06')
    expect(at('el próximo viernes')).toBe('2026-11-13')
    expect(at('el viernes que viene')).toBe('2026-11-13')
    expect(at('today')).toBe('2026-11-04')
  })

  it('reads month names in EN and ES, numeric day/month, and rolls past dates to next year', () => {
    expect(find('el 5 de noviembre')[0].date).toBe('2026-11-05')
    expect(find('due December 1st, 2026')[0].date).toBe('2026-12-01')
    expect(find('due Nov 3', wednesday)[0].date).toBe('2027-11-03')
    expect(find('entrega 5/11')[0].date).toBe('2026-11-05')
    expect(find('3pm tomorrow')).toEqual([
      { text: '3pm tomorrow', date: '2026-11-02T15:00', explicit: true }
    ])
  })

  it('drops impossible dates and keeps one candidate per wording', () => {
    expect(find('on 31/02 or 2026-02-30')).toEqual([])
    expect(find('Friday, I said Friday!').map((c) => c.text)).toEqual(['Friday'])
  })
})
