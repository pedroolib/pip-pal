import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { ALIAS_MAX } from '@shared/profile'
import { addAlias, hasTooLongAlias, removeAt } from './model'

/** Chip input for nicknames. Enter or comma adds; text left in the box is added by the form on Save. */
export function AliasField(props: {
  id: string
  hint: string
  aliases: string[]
  text: string
  autoFocus?: boolean
  onChange: (aliases: string[], text: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const { aliases, text, onChange } = props
  const [tooLong, setTooLong] = useState(false)
  const add = (v: string): void => {
    const next = addAlias(aliases, v)
    setTooLong(hasTooLongAlias(v))
    onChange(next, '')
  }
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={props.id}>{t('manual.aliases.label')}</Label>
      {aliases.length > 0 && (
        <ul className="flex min-w-0 flex-wrap gap-2 pr-2">
          {aliases.map((a, i) => (
            <li key={a} className="max-w-full min-w-0">
              <Badge
                variant="secondary"
                className="h-auto min-h-8 max-w-full whitespace-normal min-w-0 gap-1 overflow-visible pr-0.5 text-sm"
              >
                <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{a}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative size-7 shrink-0 after:absolute after:-inset-2 after:content-['']"
                  aria-label={t('manual.aliases.remove', { alias: a })}
                  onClick={() => {
                    onChange(removeAt(aliases, i), text)
                    input.current?.focus()
                  }}
                >
                  <X aria-hidden />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={props.id}
        ref={input}
        autoFocus={props.autoFocus}
        className="min-h-11 bg-background"
        maxLength={ALIAS_MAX}
        aria-describedby={tooLong ? `${props.id}-hint ${props.id}-long` : `${props.id}-hint`}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          // A typed comma ends the chip; pasted "a, b" is split the same way.
          if (v.includes(',')) add(v)
          else {
            setTooLong(v.length >= ALIAS_MAX) // the box stops accepting characters at the cap
            onChange(aliases, v)
          }
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return // IME: Enter confirms the composition, not the chip
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault() // add the chip instead of submitting the form
            add(text)
          }
        }}
      />
      <p id={`${props.id}-hint`} className="text-sm text-muted-foreground">
        {props.hint}
      </p>
      {tooLong && (
        <p id={`${props.id}-long`} className="text-sm text-muted-foreground">
          {t('manual.aliases.tooLong')}
        </p>
      )}
    </div>
  )
}
