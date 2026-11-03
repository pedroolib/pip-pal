import { describe, expect, it } from 'vitest'
import { formatLite, plannedCalls } from './compare-lite'

const label = { type: 'request', isNewTask: false, deadlineUnclear: false, whatOrWhoUnclear: false }

describe('plannedCalls', () => {
  it('always asks questions, adds steps for a new task and a plan for a change', () => {
    expect(plannedCalls(label)).toEqual([{ kind: 'questions', unclear: [] }])
    expect(
      plannedCalls({
        type: 'change',
        isNewTask: true,
        deadlineUnclear: true,
        whatOrWhoUnclear: true
      })
    ).toEqual([
      { kind: 'steps' },
      { kind: 'questions', unclear: ['deadline', 'what_or_who'] },
      { kind: 'transition' }
    ])
    expect(plannedCalls({ ...label, whatOrWhoUnclear: true })).toEqual([
      { kind: 'questions', unclear: ['what_or_who'] }
    ])
  })
})

describe('formatLite', () => {
  it('groups by message, then kind, with each model under the same heading', () => {
    const md = formatLite([
      {
        id: 'demo-project-change',
        text: 'Line one $&\nLine two',
        kinds: [
          {
            kind: 'steps',
            answers: [
              {
                model: 'sonnet',
                ms: 812,
                output: {
                  kind: 'steps',
                  steps: [
                    { text: 'Ask Alex.', why: 'You prefer writing.' },
                    { text: 'Read it.', why: null }
                  ],
                  profileUsed: []
                },
                error: null
              },
              { model: 'haiku', ms: 90, output: null, error: 'Claude request failed (500).' }
            ]
          },
          {
            kind: 'questions',
            answers: [
              {
                model: 'sonnet',
                ms: 400,
                output: {
                  kind: 'questions',
                  questions: [
                    {
                      what: '"soon" has no date.',
                      suggestedQuestion: 'By when?',
                      topic: 'deadline'
                    }
                  ],
                  profileUsed: []
                },
                error: null
              },
              {
                model: 'haiku',
                ms: 300,
                output: { kind: 'questions', questions: [], profileUsed: [] },
                error: null
              }
            ]
          },
          {
            kind: 'transition',
            answers: [
              {
                model: 'sonnet',
                ms: 500,
                output: {
                  kind: 'transition',
                  plan: ['Project changes.', 'Hand off.'],
                  questionsToAsk: ['Who owns it?'],
                  profileUsed: []
                },
                error: null
              }
            ]
          }
        ]
      }
    ])
    expect(md).toBe(
      [
        '## demo-project-change',
        '',
        '> Line one $&',
        '> Line two',
        '',
        '### steps',
        '',
        '**sonnet** (812 ms, 2 items)',
        '',
        '1. Ask Alex. (why: You prefer writing.)',
        '2. Read it.',
        '',
        '**haiku** (90 ms)',
        '',
        'ERROR: Claude request failed (500).',
        '',
        '### questions',
        '',
        '**sonnet** (400 ms, 1 items)',
        '',
        '1. "soon" has no date. -> By when?',
        '',
        '**haiku** (300 ms, 0 items)',
        '',
        '(none)',
        '',
        '### plan',
        '',
        '**sonnet** (500 ms, 3 items)',
        '',
        '1. Project changes.',
        '2. Hand off.',
        '3. Ask: Who owns it?',
        '',
        'Total calls: 5',
        ''
      ].join('\n')
    )
  })
})
