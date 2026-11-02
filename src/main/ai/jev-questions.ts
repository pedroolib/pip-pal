// Everything Jev is asked, in one place to audit and edit: wording, options, thresholds, and the code that
// turns its answers into a Classification. Jev judges; code decides. State is `{ message }`, the scrubbed text.
import { choice, noul, score } from '@typesafe-ai/sdk'
import type { Classification, Tone } from '@shared/schemas'

/** Below this isChange probability the change type reads 'none'. 0.3–0.7 is unsettled: keep the best guess. */
export const CHANGE_NO_BELOW = 0.3

export const JEV_QUESTIONS = {
  isChange: noul('Does `message` announce a change to the reader’s work?', {
    true: 'The message says the reader’s project, manager, priorities, tools, schedule or way of working is changing or has changed.',
    false:
      'The message asks for or shares something within the current setup, such as a task, a question or an update, and nothing about how the work is set up changes.'
  }),
  // No 'none' option: isChange is the companion "does anything fit" question.
  changeType: choice('What does `message` say is changing for the reader?', {
    project: 'The reader moves to a different project, or their project’s scope or goal changes.',
    leader: 'The reader gets a different manager, lead or person they report to.',
    priorities: 'What the reader should work on first, or what can wait, changes.',
    other: 'Something else about the work changes, such as tools, schedule, office or team process.'
  }),
  tone: choice('How does the writer of `message` sound?', {
    friendly: 'Warm and relaxed, for example thanks, greetings or encouragement.',
    neutral: 'Matter-of-fact, sharing information without emotion.',
    urgent: 'Pressed for time, pushing for something to happen soon.',
    frustrated: 'Annoyed or disappointed, for example about a delay or a repeated problem.',
    unclear: 'The message is too short or mixed to tell how the writer feels.'
  }),
  urgency: score('How soon does `message` need the reader to act?', [
    'Nothing to do, or it can wait weeks.',
    'Should be done in the next week or two.',
    'Should be done in the next few days.',
    'Should be done today.',
    'Needs action right now, within the hour.'
  ]),
  isAmbiguous: noul('Would the reader have to guess what `message` expects them to do?', {
    true: 'The message hints at a request or expectation without saying plainly what to do, how much, or by when.',
    false: 'The message says plainly what the reader should do, or asks nothing of them.'
  })
}

/** Raw probabilities pass through unchanged; choices and the urgency level are the most likely answers. */
export function toClassification(a: {
  isChange: { noul: number }
  changeType: { choice: Exclude<Classification['changeType'], 'none'> }
  tone: { choice: Tone }
  urgency: { probabilities: Readonly<Record<string, number>> }
  isAmbiguous: { noul: number }
}): Omit<Classification, 'source'> {
  // The level with the highest probability: the expected score gets pulled to the middle on split answers.
  const [level] = Object.entries(a.urgency.probabilities).reduce((best, x) =>
    x[1] > best[1] ? x : best
  )
  return {
    isChange: a.isChange.noul,
    changeType: a.isChange.noul < CHANGE_NO_BELOW ? 'none' : a.changeType.choice,
    tone: a.tone.choice,
    urgency: Number(level) + 1,
    isAmbiguous: a.isAmbiguous.noul
  }
}
