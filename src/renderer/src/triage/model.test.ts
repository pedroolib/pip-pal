import { describe, expect, it } from 'vitest'
import { Triage } from '@shared/schemas'
import demo from '@shared/fixtures/demo.triage.json'
import i18n from '../i18n'
import { formatDue, triageLines, unclearParts } from './model'

const NOW = new Date(2026, 10, 2, 10, 0) // Mon, Nov 2 2026, local
const base = Triage.parse(demo)
const make = (over: Record<string, unknown>): Triage => ({ ...base, ...over }) as Triage
// Intl puts a narrow no-break space before PM; compare with plain spaces.
const say = (key: string, params?: Record<string, string>): string =>
  i18n.t(key, params).replace(/\s/g, ' ')

const dueText = (deadline: NonNullable<Triage['deadline']>): string => {
  const { key, date } = formatDue(deadline, NOW, 'en')
  return say(key, { date })
}

describe('formatDue', () => {
  it('says Due when the date is explicit and Before when it is inferred', () => {
    expect(dueText({ text: 'Fri', date: '2026-11-06', explicit: true })).toBe('Due Fri, Nov 6')
    expect(dueText({ text: 'Monday', date: '2026-11-09', explicit: false })).toBe(
      'Before Mon, Nov 9'
    )
  })

  it('adds the time when the date has one', () => {
    expect(dueText({ text: 'Fri 3pm', date: '2026-11-06T15:00:00', explicit: true })).toBe(
      'Due Fri, Nov 6, 3:00 PM'
    )
  })

  it('writes today and tomorrow in words, with the time if there is one', () => {
    expect(dueText({ text: 'today', date: '2026-11-02', explicit: true })).toBe('Due today')
    expect(dueText({ text: 'tmrw', date: '2026-11-03', explicit: false })).toBe('Before tomorrow')
    expect(dueText({ text: '5pm', date: '2026-11-02T17:00:00', explicit: true })).toBe(
      'Due today, 5:00 PM'
    )
  })

  it('falls back to the message words when there is no usable date', () => {
    expect(dueText({ text: 'next sprint', date: null, explicit: false })).toBe('Before next sprint')
    expect(dueText({ text: 'soon', date: 'not a date', explicit: true })).toBe('Due soon')
  })
})

describe('unclearParts', () => {
  const parts = (over: Record<string, unknown>): string[] => unclearParts(make(over))

  it('flags the deadline from the score or from unsure', () => {
    expect(parts({ deadlineUnclear: 0.6, whatOrWhoUnclear: 0, unsure: [] })).toEqual(['deadline'])
    expect(parts({ deadlineUnclear: 0, whatOrWhoUnclear: 0, unsure: ['deadline'] })).toEqual([
      'deadline'
    ])
  })

  it('flags what_or_who from its score only', () => {
    expect(parts({ deadlineUnclear: 0, whatOrWhoUnclear: 0.7, unsure: [] })).toEqual([
      'what_or_who'
    ])
    expect(parts({ deadlineUnclear: 0.59, whatOrWhoUnclear: 0.59, unsure: [] })).toEqual([])
  })
})

describe('triageLines', () => {
  const lines = (over: Record<string, unknown> = {}): ReturnType<typeof triageLines> =>
    triageLines(make(over), NOW, 'en')

  it('shows the demo fixture exactly', () => {
    const l = lines()
    expect(l.from).toBeNull()
    expect(l.when.icon).toBe('date')
    expect(say(l.when.key, l.when.params)).toBe('Before Mon, Nov 9')
    expect(l.when.mark).toBe(true)
    expect(l.when.evidence).toBe(base.evidence.deadline)
    expect(say(l.reply)).toBe('Probably just a confirmation')
    expect(say(l.tone.key)).toBe('Friendly')
    expect(l.tone.quote).toBe('Hey Sam, heads up')
    expect(l.addressee).toBeNull()
    expect(l.actions.map((a) => a.kind)).toEqual(['transition', 'steps', 'questions'])
    expect(l.actions.every((a) => a.strength === 'primary')).toBe(true)
    expect(l.about && say(l.about)).toBe("About: when it's due")
  })

  it('shows urgency only when there is no deadline, hedged when unsure', () => {
    const noDeadline = lines({ deadline: null, unsure: [] })
    expect(noDeadline.when.icon).toBe('urgency')
    expect(say(noDeadline.when.key)).toBe('This week')
    expect(noDeadline.when.evidence).toBe(base.evidence.urgency)
    expect(say(lines({ deadline: null, unsure: ['urgency'] }).when.key)).toBe('Probably this week')
    const urgency = (value: string): string =>
      say(lines({ deadline: null, unsure: [], urgency: { value, p: 1, explicit: true } }).when.key)
    expect(urgency('no_rush')).toBe('No rush')
    expect(urgency('today')).toBe('Today')
  })

  it('has no tooltip evidence when the model gave none', () => {
    expect(lines({ evidence: {} }).when.evidence).toBeUndefined()
    expect(lines({ evidence: { deadline: '' } }).when.evidence).toBeUndefined()
  })

  it('words the reply, hedged when needsReply is unsure', () => {
    const reply = (value: string, unsure: string[]): string =>
      say(lines({ needsReply: { value, p: 1 }, unsure }).reply)
    expect(reply('yes', [])).toBe('Needs a reply')
    expect(reply('confirm_only', [])).toBe('Just confirm')
    expect(reply('no', [])).toBe('No reply needed')
    expect(reply('yes', ['needsReply'])).toBe('Probably needs a reply')
    expect(reply('confirm_only', ['needsReply'])).toBe('Probably just a confirmation')
    expect(reply('no', ['needsReply'])).toBe('Probably no reply needed')
  })

  it('puts the ? mark on the when line only with the questions action and an unclear deadline', () => {
    expect(lines().when.mark).toBe(true)
    expect(lines({ unsure: [], deadlineUnclear: 0.1 }).when.mark).toBe(false)
    const noAsk = lines({ actions: [{ kind: 'steps', strength: 'primary' }] })
    expect(noAsk.when.mark).toBe(false)
    expect(noAsk.about).toBeNull()
    // no date: the mark sits on the urgency line instead
    expect(lines({ deadline: null }).when.mark).toBe(true)
  })

  it('names what the ask button is about', () => {
    const about = (d: number, w: number): string | null => {
      const l = lines({ deadlineUnclear: d, whatOrWhoUnclear: w, unsure: [] })
      return l.about && say(l.about)
    }
    expect(about(0.9, 0)).toBe("About: when it's due")
    expect(about(0, 0.9)).toBe('About: what to do or with whom')
    expect(about(0.9, 0.9)).toBe("About: when it's due and what to do or with whom")
    expect(about(0, 0)).toBeNull()
  })

  it('shows the tone quote only when the tone is not neutral', () => {
    const neutral = lines({ tone: { value: 'neutral', p: 1 } })
    expect(say(neutral.tone.key)).toBe('Neutral')
    expect(neutral.tone.quote).toBeUndefined()
    expect(say(lines({ tone: { value: 'worried', p: 1 } }).tone.key)).toBe('Concerned')
    expect(say(lines({ tone: { value: 'upset', p: 1 } }).tone.key)).toBe('Upset')
    expect(lines({ tone: { value: 'upset', p: 1 }, evidence: {} }).tone.quote).toBeUndefined()
  })

  it('says who the message is for only for the group or nobody', () => {
    const who = (value: string): string | null => {
      const k = lines({ addressee: { value, p: 1 } }).addressee
      return k && say(k)
    }
    expect(who('group')).toBe('This is for the whole team')
    expect(who('nobody')).toBe('Not addressed to anyone')
    expect(who('me')).toBeNull()
  })

  it('shows the sender role when there is one', () => {
    expect(lines({ senderRole: 'Manager' }).from).toBe('Manager')
  })

  it('keeps the actions in order with their strength', () => {
    const actions = [
      { kind: 'steps', strength: 'primary' },
      { kind: 'questions', strength: 'maybe' }
    ]
    expect(lines({ actions }).actions).toMatchObject(actions)
  })

  it('labels the actions: the change type, any change, or the ask', () => {
    const actions = [
      { kind: 'transition', strength: 'primary' },
      { kind: 'steps', strength: 'primary' },
      { kind: 'questions', strength: 'primary' }
    ]
    const eyebrows = (changeType: string): unknown[] =>
      lines({ actions, changeType }).actions.map((a) => a.eyebrow)
    expect(eyebrows('project')).toEqual([
      { key: 'bubble.eyebrow.transition', typeKey: 'decode.changeTypes.project' },
      undefined,
      { key: 'bubble.eyebrow.questions' }
    ])
    expect(eyebrows('none')[0]).toEqual({ key: 'bubble.eyebrow.transitionAny' })
  })
})
