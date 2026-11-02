// Sample triages for the plain-browser preview only (`?triage=<name>`); the app never reads these.
import demo from '@shared/fixtures/demo.triage.json'
import { Triage } from '@shared/schemas'

const base = Triage.parse(demo)
const sample = (over: Partial<Triage>): Triage => ({
  ...base,
  deadline: null,
  deadlineUnclear: 0.1,
  whatOrWhoUnclear: 0.1,
  isChange: 0,
  changeType: 'none',
  unsure: [],
  evidence: {},
  ...over
})

const SAMPLES: Record<string, Triage> = {
  // No deadline, so urgency shows; the unclear part is what or who, and the ask button is a maybe.
  'no-deadline': sample({
    urgency: { value: 'this_week', p: 0.8, explicit: false },
    needsReply: { value: 'yes', p: 0.9 },
    tone: { value: 'worried', p: 0.8 },
    whatOrWhoUnclear: 0.7,
    evidence: {
      urgency: 'sync with Dana when you get a chance',
      tone: "sorry, I know you're swamped"
    },
    actions: [
      { kind: 'steps', strength: 'primary' },
      { kind: 'questions', strength: 'maybe' }
    ]
  }),
  clear: sample({
    senderRole: 'Manager',
    deadline: { text: 'Friday at 3', date: '2026-11-06T15:00:00', explicit: true },
    needsReply: { value: 'yes', p: 0.9 },
    tone: { value: 'neutral', p: 0.9 },
    evidence: { deadline: 'send me the numbers by Friday at 3' },
    actions: [{ kind: 'steps', strength: 'primary' }]
  }),
  team: sample({
    senderRole: 'Manager',
    urgency: { value: 'no_rush', p: 0.9, explicit: false },
    needsReply: { value: 'no', p: 0.9 },
    tone: { value: 'friendly', p: 0.9 },
    addressee: { value: 'group', p: 0.9 },
    evidence: { urgency: 'no hurry on this one', tone: 'Hi all, quick note' },
    actions: []
  }),
  // Long Spanish text: every line wraps and the tone quote is clamped to two lines.
  'narrow-long': sample({
    senderRole: 'Gerente',
    deadline: { text: 'hoy antes de las 5', date: '2026-11-12T17:00:00', explicit: true },
    needsReply: { value: 'confirm_only', p: 0.5 },
    tone: { value: 'friendly', p: 0.9 },
    whatOrWhoUnclear: 0.7,
    unsure: ['needsReply'],
    evidence: {
      deadline: 'entrégamelo hoy antes de las 5',
      tone: '¡Hola Sam! Muchísimas gracias por toda la ayuda con el reporte trimestral de la semana pasada, de verdad'
    },
    actions: [
      { kind: 'steps', strength: 'primary' },
      { kind: 'questions', strength: 'primary' }
    ]
  })
}

/** What `api.triage` stands in for in the preview: a sample, `loading` (never answers) or `error`; null for none. */
export function previewTriage(name: string | null): Promise<Triage> | null {
  if (name === 'loading') return new Promise(() => {})
  if (name === 'error') return Promise.reject(new Error('preview'))
  return (name && SAMPLES[name] && Promise.resolve(SAMPLES[name])) || null
}
