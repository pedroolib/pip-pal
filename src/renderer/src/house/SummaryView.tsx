import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, FileDown, Info, LoaderCircle } from 'lucide-react'
import { Recipient, type SummaryPoint } from '@shared/schemas'
import { api } from '@renderer/api'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { bullets } from './bullets'
import { HouseCard, Page } from './parts'

type State = 'idle' | 'loading' | 'error' | 'ready'

export function SummaryView(): React.JSX.Element {
  const { t } = useTranslation()
  const [recipient, setRecipient] = useState<Recipient>('coach')
  const [state, setState] = useState<State>('idle')
  const [points, setPoints] = useState<SummaryPoint[]>([])
  const [copied, setCopied] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const [exportFailed, setExportFailed] = useState(false)
  const picked = points.filter((p) => p.include).length
  const run = useRef(0) // only the latest Generate may set state

  async function generate(): Promise<void> {
    const mine = ++run.current
    setState('loading')
    setCopied(0)
    setSaved(null)
    setExportFailed(false)
    try {
      const s = await api.generateSummary(recipient)
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

  async function exportPdf(): Promise<void> {
    setExportFailed(false)
    try {
      setSaved(await api.exportSummaryPdf()) // null when the person cancels
    } catch {
      setExportFailed(true)
    }
  }

  const loading = state === 'loading'

  return (
    <Page title={t('house.titles.summary')} intro={t('house.summary.intro')}>
      <p className="flex w-fit max-w-full items-center gap-2.5 rounded-full bg-secondary px-4 py-2.5 text-body">
        <Info className="size-5 shrink-0" aria-hidden />
        {t('house.summary.privacy')}
      </p>

      <HouseCard>
        <div className="grid gap-2.5">
          <p id="summary-who" className="font-bold">
            {t('house.summary.who')}
          </p>
          <RadioGroup
            aria-labelledby="summary-who"
            value={recipient}
            onValueChange={(v) => setRecipient(Recipient.parse(v))}
            className="flex flex-wrap gap-2.5"
          >
            {Recipient.options.map((r) => (
              <Label
                key={r}
                className="h-11 cursor-pointer text-base rounded-full border-[1.5px] bg-surface px-[18px] font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ring has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-secondary"
              >
                <RadioGroupItem value={r} />
                {t(`manual.recipients.${r}`)}
              </Label>
            ))}
          </RadioGroup>
        </div>
        <Button
          className="min-h-11 w-fit rounded-full px-5 font-bold"
          disabled={loading}
          aria-busy={loading}
          onClick={generate}
        >
          {loading && <LoaderCircle className="animate-spin" aria-hidden />}
          {loading ? t('house.summary.loading') : t('house.summary.generate')}
        </Button>
      </HouseCard>

      {loading && (
        <HouseCard role="status">
          <p className="flex items-center gap-2.5 font-bold">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            {t('house.summary.loading')}
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-[18px] rounded-full bg-muted" />
          ))}
        </HouseCard>
      )}

      {state === 'error' && (
        <HouseCard role="alert">
          <p className="font-bold">{t('house.summary.errorTitle')}</p>
          <p className="text-body">{t('house.summary.errorBody')}</p>
          <Button className="min-h-11 w-fit rounded-full px-5 font-bold" onClick={generate}>
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
                      className="mt-px size-[22px] border-2 border-body bg-surface"
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
              className="min-h-11 rounded-full bg-surface px-5 font-bold"
              disabled={picked === 0}
              onClick={copy}
            >
              <Copy aria-hidden />
              {t('house.summary.copy')}
            </Button>
            <Button
              variant="outline"
              className="min-h-11 rounded-full bg-surface px-5 font-bold"
              disabled={picked === 0}
              onClick={exportPdf}
            >
              <FileDown aria-hidden />
              {t('house.summary.exportPdf')}
            </Button>
          </div>
          <p role="status" className="text-sm text-body empty:hidden">
            {copied > 0 && t('house.summary.copied', { count: copied })}
          </p>
          {saved && (
            <p role="status" className="text-sm break-all text-body">
              {t('house.summary.savedTo', { path: saved })}
            </p>
          )}
          {exportFailed && (
            <p role="alert" className="text-sm text-body">
              {t('house.summary.exportFailed')}
            </p>
          )}
        </HouseCard>
      )}
    </Page>
  )
}
