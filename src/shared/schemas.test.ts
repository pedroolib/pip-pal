import { describe, expect, it } from 'vitest'
import {
  ActionKind,
  Expansion,
  LoggableEvent,
  Profile,
  QuestionTopic,
  Triage,
  UnclearPart,
  UsageEvent
} from './schemas'
import eventsJson from './fixtures/week.events.json'
import { createMockApi } from './mock-api'
import triageJson from './fixtures/demo.triage.json'
import stepsJson from './fixtures/demo.expansion.steps.json'
import questionsJson from './fixtures/demo.expansion.questions.json'
import transitionJson from './fixtures/demo.expansion.transition.json'
import samJson from './fixtures/sam.profile.json'

const MESSAGE =
  "Hey Sam, heads up, we're moving you to the Q1 forecasting project starting Monday. Can you wrap up the dashboard stuff and sync with Dana when you get a chance? Thx"
const expansions = [stepsJson, questionsJson, transitionJson]

describe('triage and expansion fixtures', () => {
  it('triage fixture parses and its evidence quotes appear in the message', () => {
    const triage = Triage.parse(triageJson)
    for (const quote of Object.values(triage.evidence)) expect(MESSAGE).toContain(quote)
    expect(triage.actions.map((a) => a.kind)).toEqual(['transition', 'steps', 'questions'])
  })

  it('has one expansion fixture per action kind, using sections Sam has', () => {
    const sam = Profile.parse(samJson)
    const parsed = expansions.map((e) => Expansion.parse(e))
    expect(parsed.map((e) => e.kind).sort()).toEqual([...ActionKind.options].sort())
    for (const e of parsed)
      for (const { section } of e.profileUsed)
        expect(sam.sections[section]?.length).toBeGreaterThan(0)
  })

  it('rejects an expansion whose body does not match its kind', () => {
    expect(Expansion.safeParse({ kind: 'steps', questions: [], profileUsed: [] }).success).toBe(
      false
    )
  })

  it('the mock api serves triage and the expansion of the requested kind', async () => {
    const api = createMockApi()
    expect((await api.triage('x')).source).toBe('jev')
    for (const kind of ActionKind.options) expect((await api.expand('x', kind, 3)).kind).toBe(kind)
    expect((await api.expand('x', 'questions', 3, ['deadline'])).kind).toBe('questions')
  })

  it('accepts only the known unclear parts', () => {
    expect(UnclearPart.options).toEqual(['deadline', 'what_or_who'])
    expect(UnclearPart.safeParse('when').success).toBe(false)
  })
})

describe('profile aliases', () => {
  const sam = Profile.parse(samJson)

  it('accepts trimmed aliases on the profile and on each person, and stays optional', () => {
    const parsed = Profile.parse({
      ...sam,
      aliases: [' Sammy '],
      people: [{ name: 'Alex Morgan', role: 'Manager', aliases: ['Ally', '@alexr'] }]
    })
    expect(parsed.aliases).toEqual(['Sammy'])
    expect(parsed.people[0].aliases).toEqual(['Ally', '@alexr'])
    expect(sam.aliases).toBeUndefined()
  })

  it('rejects an empty alias', () => {
    expect(Profile.safeParse({ ...sam, aliases: ['  '] }).success).toBe(false)
    const people = [{ name: 'Alex', role: 'Manager', aliases: [''] }]
    expect(Profile.safeParse({ ...sam, people }).success).toBe(false)
  })
})

describe('usage events', () => {
  it('the week events fixture parses, with ids unique', () => {
    const events = UsageEvent.array().parse(eventsJson)
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
  })

  it('the renderer may log asked, step and calm but not decoded or action', () => {
    expect(
      LoggableEvent.safeParse({ kind: 'asked', topic: 'deadline', question: 'By when?' }).success
    ).toBe(true)
    const decoded = {
      kind: 'decoded',
      text: 'hi',
      isChange: 0,
      changeType: 'none',
      isNewTask: 0,
      tone: 'neutral'
    }
    expect(LoggableEvent.safeParse(decoded).success).toBe(false)
    expect(LoggableEvent.safeParse({ kind: 'action', action: 'steps' }).success).toBe(false)
  })

  it('every fixture question has a topic', () => {
    for (const q of questionsJson.questions)
      expect(QuestionTopic.safeParse((q as { topic?: string }).topic).success).toBe(true)
  })

  it('the mock api keeps events in memory and refreshLearned returns a pending entry', async () => {
    const api = createMockApi()
    const before = await api.listEvents()
    await api.logEvent({ kind: 'calm', status: 'used', strategyId: null })
    expect(await api.listEvents()).toHaveLength(before.length + 1)
    await api.deleteEvent(before[0].id)
    expect(await api.listEvents()).toHaveLength(before.length)
    await api.clearEvents()
    expect(await api.listEvents()).toEqual([])
    expect((await api.refreshLearned()).pending?.length).toBeGreaterThan(0)
    expect((await api.getProfile()).pending?.map((p) => p.key)).toContain('energy:midday')
    await api.refreshLearned()
    expect((await api.getProfile()).pending).toHaveLength(1)
    expect((await api.generateSummary('coach', '7d')).period).toBe('7d')
  })
})
