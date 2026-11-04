// Voice dictation for a text field: record the mic, write it down on this machine (api.transcribe),
// and add the words after the cursor. It only fills the field; the person still sends or saves.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { RECORD_MAX_MS } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { dictateFailure, insertAt, type DictateFailure } from './model'
import { startRecording, type Recording } from './recorder'

type Phase = 'idle' | 'starting' | 'recording' | 'transcribing'

interface Props {
  /** The field to fill; its current value and caret are read when the words arrive. */
  field: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  /** Gets the new full value; set it into the field's state. */
  onText: (next: string) => void
  className?: string
}

export function DictateButton({ field, onText, className }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<DictateFailure | null>(null)
  const rec = useRef<Recording | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(timer.current)
      rec.current?.cancel()
    }
  }, [])

  const stop = async (): Promise<void> => {
    const r = rec.current
    if (!r) return
    rec.current = null
    clearTimeout(timer.current)
    setPhase('transcribing')
    try {
      const text = await api.transcribe(await r.stop())
      const el = field.current
      if (!alive.current || !el) return
      const { value, caret } = insertAt(
        el.value,
        text,
        el.selectionEnd ?? el.value.length,
        el.maxLength > 0 ? el.maxLength : Infinity
      )
      onText(value)
      // Back into the field with the caret after the words, once React has written the new value.
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(caret, caret)
      })
    } catch (e) {
      if (alive.current) setFailure(dictateFailure(e))
    } finally {
      if (alive.current) setPhase('idle')
    }
  }

  const start = async (): Promise<void> => {
    setFailure(null)
    setPhase('starting')
    try {
      rec.current = await startRecording('mic', () => {})
      if (!alive.current) return rec.current.cancel()
      setPhase('recording')
      timer.current = setTimeout(() => void stop(), RECORD_MAX_MS)
    } catch (e) {
      setFailure(dictateFailure(e))
      setPhase('idle')
    }
  }

  const busy = phase === 'starting' || phase === 'transcribing'
  const recording = phase === 'recording'
  const label = t(recording ? 'dictate.stop' : 'dictate.start')
  return (
    <span className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        type="button"
        data-overlay-hit
        variant={recording ? 'default' : 'outline'}
        size="sm"
        disabled={busy}
        aria-pressed={recording}
        className={cn(recording && 'motion-safe:animate-pulse')}
        onClick={() => void (recording ? stop() : start())}
      >
        {busy ? (
          <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        ) : recording ? (
          <Square aria-hidden />
        ) : (
          <Mic aria-hidden />
        )}
        {phase === 'transcribing' ? t('dictate.writing') : label}
      </Button>
      <span role="status" className="text-sm text-body">
        {recording ? t('dictate.listening') : failure && t(`dictate.${failure}`)}
      </span>
    </span>
  )
}
