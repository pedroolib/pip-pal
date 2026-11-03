// One icon per bubble action, shared by the bubble's buttons and the docked Pips' badges.
import { CircleHelp, ListChecks, Route, type LucideIcon } from 'lucide-react'
import type { ActionKind } from '@shared/schemas'

export const ACTION_ICON: Record<ActionKind, LucideIcon> = {
  transition: Route,
  steps: ListChecks,
  questions: CircleHelp
}
