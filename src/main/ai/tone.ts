// The person's chosen tone (Settings.tone) as one extra block in a system prompt. It changes only how Pip's
// own sentences sound, never the facts, steps or "why"s, and never what is drafted to send to someone else.
import type { ReplyTone } from '@shared/schemas'

const KEEP = `This changes only the wording of your own sentences. Facts, steps, reasons and their order stay exactly as they would be. Stay literal and unambiguous: no sarcasm, nothing that could be read two ways. Anything drafted for the person to send to someone else (a suggested question or message) stays neutral and polite, in the tone the sender expects at work. Copy [Role] tokens unchanged.`

const STYLE: Record<ReplyTone, string> = {
  plain: '',
  friend: `Tone: the person asked you to talk like a friend: warm, relaxed, everyday words, contractions, a light encouraging touch. ${KEEP}`,
  boss: `Tone: the person asked you to talk like a direct boss: short, brisk, no cushioning or small talk, one clear instruction per sentence. Never harsh or belittling. ${KEEP}`,
  raw: `Tone: the person asked you to talk like a close mate, in their own register: casual slang, and swearing when it fits. They chose this and find it easier to read. Swearing is never aimed at the person or at anyone named, and never about their abilities. ${KEEP}`
}

/** The system prompt with the tone block added; unchanged for `plain` or no choice. */
export const withTone = (system: string, tone?: ReplyTone): string =>
  tone && STYLE[tone] ? `${system}\n\n${STYLE[tone]}` : system
