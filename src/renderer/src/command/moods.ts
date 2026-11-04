// Pip's face for each menu action: the menu shows it on hover and the action's card keeps it.
import type { Mood } from '@renderer/pip/Pip'
import type { CommandItem } from './CommandMenu'

export const MOOD: Record<CommandItem, Mood> = {
  home: 'hello',
  listen: 'listening',
  checkIn: 'gentle',
  tell: 'reading',
  remind: 'thinking'
}
