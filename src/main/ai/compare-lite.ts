// Pure helpers for scripts/compare-lite.mjs: which expand calls a labelled message gets, and the markdown report.
import type { ActionKind, Expansion, UnclearPart } from '@shared/schemas'

export interface LiteLabel {
  type: string
  isNewTask: boolean
  deadlineUnclear: boolean
  whatOrWhoUnclear: boolean
}
export interface LiteAnswer {
  model: string
  ms: number
  output: Expansion | null
  error: string | null
}
export interface LiteSection {
  id: string
  text: string
  kinds: { kind: ActionKind; answers: LiteAnswer[] }[]
}

export function plannedCalls(m: LiteLabel): { kind: ActionKind; unclear?: UnclearPart[] }[] {
  const unclear: UnclearPart[] = []
  if (m.deadlineUnclear) unclear.push('deadline')
  if (m.whatOrWhoUnclear) unclear.push('what_or_who')
  return [
    ...(m.isNewTask ? [{ kind: 'steps' as const }] : []),
    { kind: 'questions', unclear },
    ...(m.type === 'change' ? [{ kind: 'transition' as const }] : [])
  ]
}

const HEADING: Record<ActionKind, string> = {
  steps: 'steps',
  questions: 'questions',
  transition: 'plan'
}

function items(e: Expansion): string[] {
  if (e.kind === 'steps') return e.steps.map((s) => (s.why ? `${s.text} (why: ${s.why})` : s.text))
  if (e.kind === 'questions') return e.questions.map((q) => `${q.what} -> ${q.suggestedQuestion}`)
  return [...e.plan, ...e.questionsToAsk.map((q) => `Ask: ${q}`)]
}

function answer({ model, ms, output, error }: LiteAnswer): string[] {
  if (!output) return [`**${model}** (${ms} ms)`, '', `ERROR: ${error}`, '']
  const list = items(output)
  const body = list.length ? list.map((item, i) => `${i + 1}. ${item}`) : ['(none)']
  return [`**${model}** (${ms} ms, ${list.length} items)`, '', ...body, '']
}

export function formatLite(sections: LiteSection[]): string {
  const lines: string[] = []
  let calls = 0
  for (const { id, text, kinds } of sections) {
    lines.push(`## ${id}`, '', ...text.split('\n').map((l) => `> ${l}`), '')
    for (const { kind, answers } of kinds) {
      lines.push(`### ${HEADING[kind]}`, '')
      for (const a of answers) lines.push(...answer(a))
      calls += answers.length
    }
  }
  return [...lines, `Total calls: ${calls}`, ''].join('\n')
}
