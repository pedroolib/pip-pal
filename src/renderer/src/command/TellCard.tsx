// Tell Pip: one message, one answer, once per open. The words are saved by main before Pip answers, so a
// failure still keeps them and "Try again" only asks for the reply again (the rememberer skips identical text).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, RotateCcw, X } from 'lucide-react'
import { CORRECTION_MAX } from '@shared/ipc'
import type { TellAnswer } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Textarea } from '@renderer/components/ui/textarea'
import { RememberNote } from '@renderer/expand/RememberNote'
import { Pip, type Mood } from '@renderer/pip/Pip'
import { DictateButton } from '@renderer/record/DictateButton'
import { CARD_WIDTH } from '@renderer/triage/model'

type Phase = 'write' | 'sending' | 'answered' | 'failed'

export function TellCard({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('write')
  const [answer, setAnswer] = useState<TellAnswer | null>(null)
  const [noteDone, setNoteDone] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  // Each send gets a number; an answer that arrives after close or after a newer send is dropped.
  const run = useRef(0)

  useEffect(() => {
    api.setOverlayFocus(true)
    return () => {
      run.current++
      api.setOverlayFocus(false)
    }
  }, [])

  const send = (): void => {
    const mine = ++run.current
    setPhase('sending')
    setNoteDone(false)
    api.tellPip(text.trim()).then(
      (a) => {
        if (run.current !== mine) return
        setAnswer(a)
        setPhase(a.reply === null ? 'failed' : 'answered')
      },
      () => {
        if (run.current !== mine) return
        setAnswer(null)
        setPhase('failed')
      }
    )
  }
  const another = (): void => {
    run.current++
    setText('')
    setAnswer(null)
    setPhase('write')
    // RememberNote gives the keyboard back when it closes, and this card still needs it.
    api.setOverlayFocus(true)
    field.current?.focus()
  }

  const mood: Mood =
    phase === 'sending'
      ? 'thinking'
      : phase === 'answered'
        ? 'thanks'
        : phase === 'failed'
          ? 'gentle'
          : 'calm'
  const sent = phase !== 'write'
  return (
    <Card
      className="min-h-0 gap-4 overflow-y-auto p-5 shadow-lg"
      style={{ width: CARD_WIDTH, maxWidth: '100%' }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="flex items-center gap-3">
        <Pip mood={mood} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="font-bold">{t('tell.title')}</h1>
          <p className="text-sm text-body">{t('tell.hint')}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t('tell.close')} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>

      {phase === 'answered' || phase === 'failed' ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm text-body">
          <span className="text-xs text-muted-foreground">{t('tell.youSaid')}</span>
          <span className="break-words whitespace-pre-wrap">{text.trim()}</span>
        </div>
      ) : (
        <Textarea
          ref={field}
          autoFocus
          value={text}
          readOnly={phase === 'sending'}
          maxLength={CORRECTION_MAX}
          aria-label={t('tell.label')}
          placeholder={t('tell.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {phase === 'write' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={!text.trim()} onClick={send}>
            {t('tell.send')}
          </Button>
          <DictateButton field={field} onText={setText} />
        </div>
      )}
      {phase === 'sending' && (
        <p role="status" className="flex items-center gap-2 text-sm text-body">
          <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
          {t('tell.sending')}
        </p>
      )}
      {phase === 'answered' && answer?.reply && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-base leading-snug font-bold">{answer.reply}</p>
          {answer.why && (
            <p className="text-sm text-body">
              <span className="font-bold">{t('tell.why')}</span> {answer.why}
            </p>
          )}
        </div>
      )}
      {phase === 'failed' && (
        <div className="flex flex-col gap-2" role="status">
          <p className="font-bold">{t('tell.failedTitle')}</p>
          <p className="text-sm text-body">{t('tell.failedBody')}</p>
          <Button variant="outline" size="sm" className="self-start" onClick={send}>
            <RotateCcw aria-hidden />
            {t('tell.tryAgain')}
          </Button>
        </div>
      )}

      {sent && answer?.note && !noteDone && (
        <RememberNote
          key={answer.note.text}
          note={answer.note}
          onDone={() => {
            setNoteDone(true)
            api.setOverlayFocus(true)
          }}
        />
      )}
      {(phase === 'answered' || phase === 'failed') && (
        <Button variant="ghost" className="self-start text-primary" onClick={another}>
          {t('tell.another')}
        </Button>
      )}
    </Card>
  )
}
