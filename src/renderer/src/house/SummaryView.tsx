import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, FileDown, Info, LoaderCircle } from 'lucide-react'
import { Recipient, SummaryPeriod, type SummaryPoint } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Pip } from '@renderer/pip/Pip'
import { bullets } from './bullets'
import { choice, HouseCard, Page } from './parts'

type State = 'idle' | 'loading' | 'error' | 'ready'

/** A labelled group of pills (a radio group); each item sits in a Label so it has visible text. */
function Pills({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string
  label: string
  value: string
  options: { value: string; text: string }[]
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-2.5">
      <p id={id} className="text-sm font-bold text-body">
        {label}
      </p>
      <RadioGroup
        aria-labelledby={id}
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => (
          <Label key={o.value} className={choice}>
            <RadioGroupItem value={o.value} />
            {o.text}
          </Label>
        ))}
      </RadioGroup>
    </div>
  )
}

export function SummaryView(): React.JSX.Element {
  const { t } = useTranslation()
  const [recipient, setRecipient] = useState<Recipient>('coach')
  const [period, setPeriod] = useState<SummaryPeriod>('7d')
  const [state, setState] = useState<State>('idle')
  const [points, setPoints] = useState<SummaryPoint[]>([])
  const [copied, setCopied] = useState(0)
  const picked = points.filter((p) => p.include).length
  const run = useRef(0) // only the latest Generate may set state

  /** A summary is for one recipient and period: drop it, and ignore any generate still in flight. */
  function clear(): void {
    run.current++
    setPoints([])
    setCopied(0)
    setState('idle')
  }

  async function generate(): Promise<void> {
    const mine = ++run.current
    setState('loading')
    setCopied(0)
    try {
      const s = await api.generateSummary(recipient, period)
      if (mine !== run.current) return
      setPoints(s.points)
      setState('ready')
    } catch {
      if (mine === run.current) setState('error')
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(bullets(points))
      setCopied(picked)
      setTimeout(() => setCopied(0), 2000)
    } catch {
      // Clipboard blocked: the label simply stays "Copy".
    }
  }

  const loading = state === 'loading'

  return (
    <Page title={t('house.titles.summary')}>
      <p className="flex w-fit max-w-full items-center gap-2 text-sm text-body">
        <Info className="size-4 shrink-0 text-primary" aria-hidden />
        {t('house.summary.privacy')}
      </p>

      <HouseCard className="gap-5">
        <Pills
          id="summary-who"
          label={t('house.summary.who')}
          value={recipient}
          options={Recipient.options.map((r) => ({ value: r, text: t(`manual.recipients.${r}`) }))}
          onChange={(v) => {
            clear()
            setRecipient(Recipient.parse(v))
          }}
        />
        <Pills
          id="summary-period"
          label={t('house.summary.period')}
          value={period}
          options={SummaryPeriod.options.map((p) => ({
            value: p,
            text: t(`house.summary.periods.${p}`)
          }))}
          onChange={(v) => {
            clear()
            setPeriod(SummaryPeriod.parse(v))
          }}
        />
        <Button
          className="min-h-10 w-fit px-4"
          disabled={loading}
          aria-busy={loading}
          onClick={generate}
        >
          {loading && <LoaderCircle className="animate-spin" aria-hidden />}
          {loading ? t('house.summary.loading') : t('house.summary.generate')}
        </Button>
      </HouseCard>

      {state === 'idle' && (
        <div className="flex items-center gap-4 rounded-card border border-dashed border-input px-5 py-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-pip-soft">
            <Pip mood="calm" size={34} />
          </span>
          <p className="max-w-[58ch] text-[0.9375rem] text-body">{t('house.summary.emptyHint')}</p>
        </div>
      )}

      {loading && (
        <HouseCard role="status">
          <p className="flex items-center gap-2.5 font-bold">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            {t('house.summary.loading')}
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="skeleton h-4 rounded-md" />
          ))}
        </HouseCard>
      )}

      {state === 'error' && (
        <HouseCard role="alert">
          <p className="font-bold">{t('house.summary.errorTitle')}</p>
          <p className="text-body">{t('house.summary.errorBody')}</p>
          <Button className="min-h-10 w-fit px-4" onClick={generate}>
            {t('house.summary.retry')}
          </Button>
        </HouseCard>
      )}

      {state === 'ready' && (
        <HouseCard>
          {points.length === 0 ? (
            <p className="text-body">{t('house.summary.empty')}</p>
          ) : (
            <ul aria-label={t('house.summary.pointsLabel')}>
              {points.map((p, i) => (
                <li key={i} className="border-border not-first:border-t">
                  <label className="flex cursor-pointer items-start gap-3.5 px-1 py-3.5">
                    <Checkbox
                      className="mt-0.5 size-5"
                      checked={p.include}
                      onCheckedChange={(c) =>
                        setPoints((all) =>
                          all.map((x, j) => (j === i ? { ...x, include: c === true } : x))
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className={p.include ? 'block' : 'block text-muted-foreground'}>
                        {p.text}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {t(`house.summary.sources.${p.source}`)}
                      </span>
                      {p.why && (
                        <span className="block text-sm text-muted-foreground">
                          {t('house.summary.why', { why: p.why })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {t('house.summary.selected', { picked, total: points.length })}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="outline"
              className="min-h-10 px-4"
              disabled={picked === 0}
              onClick={copy}
            >
              <Copy aria-hidden />
              {t('house.summary.copy')}
            </Button>
            {/* Not built yet: same disabled look as the Connections "Coming soon" buttons. */}
            <Button
              disabled
              variant="outline"
              className="min-h-10 px-4 text-muted-foreground disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100"
            >
              <FileDown aria-hidden />
              {t('house.summary.exportPdf')} · {t('house.connections.soon')}
            </Button>
          </div>
          <p role="status" className="text-sm text-body empty:hidden">
            {copied > 0 && t('house.summary.copied', { count: copied })}
          </p>
        </HouseCard>
      )}
    </Page>
  )
}
