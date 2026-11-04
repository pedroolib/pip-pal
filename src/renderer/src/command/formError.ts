// Which line the reminder form shows for a rejected save.
import { REMINDER_ERROR } from '@shared/schemas'

export type FormError = 'errorPast' | 'errorLong' | 'errorFull' | 'errorGeneric'

export function errorFor(e: unknown): FormError {
  const m = e instanceof Error ? e.message : ''
  if (m.includes(REMINDER_ERROR.past)) return 'errorPast'
  if (m.includes(REMINDER_ERROR.long)) return 'errorLong'
  if (m.includes(REMINDER_ERROR.full)) return 'errorFull'
  return 'errorGeneric'
}
