import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { SECTIONS, type Profile, type Recipient, type Section } from '@shared/schemas'
import { ensureIds } from '@shared/profile'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/api'
import { activeIndex, removeAt, removeById, upsert } from './model'
import { Block, ConfirmDelete, Editor, Row, type Draft } from './parts'

type Del = {
  title: string
  quote: string
  keep: string
  confirm: string
  next: Profile
  focusId: string
}

const PEOPLE = 'people'
const CALMING = 'calming'
const NEW = 'new'
const NAV_IDS: string[] = [...SECTIONS, CALMING, PEOPLE]

function Manual(): React.JSX.Element {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [del, setDel] = useState<Del | null>(null)
  const [delFailed, setDelFailed] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [current, setCurrent] = useState<string | null>(null)
  const lockUntil = useRef(0)

  const load = useCallback((alive: () => boolean = () => true) => {
    api
      .getProfile()
      .then((p) => {
        if (!alive()) return
        const full = ensureIds(p)
        setProfile(full)
        setOpen({
          ...Object.fromEntries(SECTIONS.map((s) => [s, full.sections[s].length > 0])),
          [CALMING]: true,
          [PEOPLE]: true
        })
      })
      .catch(() => alive() && setFailed(true))
  }, [])
  useEffect(() => {
    let alive = true // StrictMode runs this twice; only the last load may set state
    load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(null), 4000)
    return () => clearTimeout(id)
  }, [saved])

  /** Writes the profile; on failure the editor stays open and nothing local changes. */
  async function persist(next: Profile): Promise<boolean> {
    try {
      await api.saveProfile(next)
      setProfile(next)
      return true
    } catch {
      return false
    }
  }

  async function commit(next: Profile, key: string, savedKey: string): Promise<boolean> {
    if (!(await persist(next))) return false
    setEditing(null)
    setSaved(savedKey)
    // Wait a frame so the row (and its Edit button) is back in the DOM.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-edit="${key}"]`)?.focus()
    )
    return true
  }

  async function confirmDelete(): Promise<void> {
    if (!del) return
    setDelFailed(false)
    if (!(await persist(del.next))) return setDelFailed(true)
    const { focusId } = del
    setDel(null)
    setEditing(null)
    requestAnimationFrame(() => document.getElementById(`${focusId}-h`)?.focus())
  }

  /** Closes the editor without saving and puts focus back where the person was. */
  function cancel(key: string): void {
    setEditing(null)
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(`[data-edit="${key}"]`) ??
        document.getElementById(`${key.split(':')[0]}-h`)
      )?.focus()
    )
  }

  function jump(id: string): void {
    setOpen((o) => ({ ...o, [id]: true }))
    setCurrent(id)
    requestAnimationFrame(() => {
      lockUntil.current = performance.now() + 300
      document.getElementById(id)?.scrollIntoView()
    })
  }

  function add(id: string, key: string): void {
    setOpen((o) => ({ ...o, [id]: true }))
    setEditing(key)
  }

  const ready = profile !== null
  useEffect(() => {
    if (!ready) return
    let frame = 0
    const update = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (performance.now() < lockUntil.current) return // a nav click just set the target
        const tops = NAV_IDS.map(
          (id) => document.getElementById(id)?.getBoundingClientRect().top ?? 0
        )
        const remaining =
          document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)
        setCurrent(NAV_IDS[activeIndex(tops, window.innerHeight, Math.max(0, remaining))])
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ready])

  if (failed || !profile) {
    return (
      <Shell>
        {failed ? (
          <div role="alert" className="grid gap-3 rounded-lg border p-5">
            <p className="flex items-center gap-2 font-bold text-primary">
              <Info className="size-4" aria-hidden /> {t('manual.loadError.title')}
            </p>
            <p>{t('manual.loadError.body')}</p>
            <Button
              className="min-h-11 w-fit"
              onClick={() => {
                setFailed(false)
                load()
              }}
            >
              {t('manual.loadError.retry')}
            </Button>
          </div>
        ) : (
          <div role="status" className="grid gap-4">
            <span className="sr-only">{t('manual.loading')}</span>
            <div aria-hidden className="h-32 rounded-lg bg-muted" />
            <div aria-hidden className="h-32 rounded-lg bg-muted" />
          </div>
        )}
      </Shell>
    )
  }

  const draftOf = (text: string, visibleTo: Recipient[], minutes = ''): Partial<Draft> => ({
    text,
    visibleTo,
    minutes
  })
  const tick = (key: string): boolean => saved === key

  const renderSection = (s: Section): React.JSX.Element => {
    const entries = profile.sections[s]
    const title = t(`manual.sections.${s}`)
    const setEntries = (list: typeof entries): Profile => ({
      ...profile,
      sections: { ...profile.sections, [s]: list }
    })
    return (
      <Block
        key={s}
        id={s}
        emptyText={t(s === 'energy' ? 'manual.emptyEnergy' : 'manual.empty')}
        title={title}
        count={entries.length ? t('manual.count', { count: entries.length }) : ''}
        open={open[s]}
        onOpenChange={(o) => setOpen((x) => ({ ...x, [s]: o }))}
        empty={entries.length === 0 && editing !== `${s}:${NEW}`}
        formOpen={!!editing?.startsWith(`${s}:`)}
        addLabel={t('manual.add')}
        onAdd={() => add(s, `${s}:${NEW}`)}
      >
        {entries.map((e, i) => {
          const key = `${s}:${e.id}`
          return editing === key ? (
            <Editor
              key={key}
              kind="entry"
              initial={draftOf(e.text, e.visibleTo)}
              onCancel={() => cancel(key)}
              onSave={(d) =>
                commit(
                  setEntries(
                    upsert(entries, { ...e, text: d.text.trim(), visibleTo: d.visibleTo })
                  ),
                  key,
                  key
                )
              }
            />
          ) : (
            <Row
              key={key}
              rowKey={key}
              origin={e.origin}
              shared={e.visibleTo}
              saved={tick(key)}
              what={t('manual.entryLabel', { n: i + 1, section: title })}
              onEdit={() => setEditing(key)}
              onDelete={() =>
                setDel({
                  title: t('manual.dialog.title'),
                  quote: e.text,
                  keep: t('manual.dialog.keep'),
                  confirm: t('manual.dialog.confirm'),
                  next: setEntries(removeById(entries, e.id!)),
                  focusId: s
                })
              }
            >
              {e.text}
            </Row>
          )
        })}
        {editing === `${s}:${NEW}` && (
          <Editor
            kind="entry"
            onCancel={() => cancel(`${s}:${NEW}`)}
            onSave={(d) => {
              const list = upsert(entries, {
                text: d.text.trim(),
                origin: 'self',
                visibleTo: d.visibleTo
              })
              const id = list[list.length - 1].id
              return commit(setEntries(list), `${s}:${id}`, `${s}:${id}`)
            }}
          />
        )}
      </Block>
    )
  }

  const strategies = profile.calmingStrategies
  const setStrategies = (list: typeof strategies): Profile => ({
    ...profile,
    calmingStrategies: list
  })
  const strategyOf = (d: Draft, base: object): (typeof strategies)[number] =>
    ({
      origin: 'self',
      ...base,
      label: d.text.trim(),
      minutes: Number(d.minutes),
      visibleTo: d.visibleTo
    }) as (typeof strategies)[number]

  const people = profile.people
  const setPeople = (list: typeof people): Profile => ({ ...profile, people: list })

  const nav: { id: string; label: string; count?: number }[] = [
    ...SECTIONS.map((s) => ({
      id: s as string,
      label: t(`manual.sections.${s}`),
      count: profile.sections[s].length
    })),
    { id: CALMING, label: t('manual.calming.title'), count: strategies.length },
    { id: PEOPLE, label: t('manual.people.title'), count: people.length }
  ]

  return (
    <Shell
      index={
        <nav
          aria-label={t('manual.indexLabel')}
          className="hidden w-60 shrink-0 self-start lg:sticky lg:top-6 lg:block"
        >
          <ul className="grid gap-0.5 text-[15px]">
            {nav.map((n, i) => (
              <li key={n.id} className={i === SECTIONS.length ? 'mt-2 border-t pt-2' : ''}>
                <a
                  href={`#${n.id}`}
                  aria-current={current === n.id ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    jump(n.id)
                  }}
                  className="group flex min-h-11 items-center justify-between rounded-md px-3 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current=location]:bg-secondary aria-[current=location]:font-bold"
                >
                  {n.label}
                  {!!n.count && (
                    <span className="text-muted-foreground group-aria-[current=location]:text-foreground">
                      {n.count}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      }
      header={
        <>
          <h1 className="text-[28px] leading-tight font-bold">{t('manual.title')}</h1>
          <p className="max-w-[44rem] text-base text-muted-foreground">
            {t('manual.subtitle', { name: profile.name, role: profile.role })}
          </p>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-[1.6] text-body">
            {t('manual.intro')}
          </p>
        </>
      }
    >
      <div className="grid gap-5">
        {SECTIONS.map(renderSection)}

        <Block
          id={CALMING}
          emptyText={t('manual.empty')}
          title={t('manual.calming.title')}
          count={strategies.length ? t('manual.things', { count: strategies.length }) : ''}
          note={t('manual.calming.note')}
          open={open[CALMING]}
          onOpenChange={(o) => setOpen((x) => ({ ...x, [CALMING]: o }))}
          empty={false}
          formOpen={!!editing?.startsWith(`${CALMING}:`)}
          addLabel={t('manual.calming.add')}
          onAdd={() => add(CALMING, `${CALMING}:${NEW}`)}
        >
          {strategies.map((c) => {
            const key = `${CALMING}:${c.id}`
            return editing === key ? (
              <Editor
                key={key}
                kind="strategy"
                initial={draftOf(c.label, c.visibleTo, String(c.minutes))}
                onCancel={() => cancel(key)}
                onSave={(d) =>
                  commit(setStrategies(upsert(strategies, strategyOf(d, c))), key, key)
                }
              />
            ) : (
              <Row
                key={key}
                rowKey={key}
                origin={c.origin}
                shared={c.visibleTo}
                saved={tick(key)}
                what={c.label}
                onEdit={() => setEditing(key)}
                onDelete={() =>
                  setDel({
                    title: t('manual.calming.deleteTitle'),
                    quote: c.label,
                    keep: t('manual.calming.keep'),
                    confirm: t('manual.calming.confirm'),
                    next: setStrategies(removeById(strategies, c.id!)),
                    focusId: CALMING
                  })
                }
              >
                <strong>{c.label}</strong>{' '}
                <span className="whitespace-nowrap text-body">
                  {t('manual.calming.minutesShort', { count: c.minutes })}
                </span>
              </Row>
            )
          })}
          {editing === `${CALMING}:${NEW}` && (
            <Editor
              kind="strategy"
              onCancel={() => cancel(`${CALMING}:${NEW}`)}
              onSave={(d) => {
                const list = upsert(strategies, strategyOf(d, {}))
                const key = `${CALMING}:${list[list.length - 1].id}`
                return commit(setStrategies(list), key, key)
              }}
            />
          )}
        </Block>

        <Block
          id={PEOPLE}
          emptyText={t('manual.empty')}
          title={t('manual.people.title')}
          count={people.length ? t('manual.people', { count: people.length }) : ''}
          note={t('manual.people.note')}
          open={open[PEOPLE]}
          onOpenChange={(o) => setOpen((x) => ({ ...x, [PEOPLE]: o }))}
          empty={false}
          formOpen={!!editing?.startsWith(`${PEOPLE}:`)}
          addLabel={t('manual.people.add')}
          onAdd={() => add(PEOPLE, `${PEOPLE}:${NEW}`)}
        >
          {people.map((p, i) => {
            const key = `${PEOPLE}:${i}`
            return editing === key ? (
              <Editor
                key={key}
                kind="person"
                initial={{ name: p.name, role: p.role }}
                onCancel={() => cancel(key)}
                onSave={(d) =>
                  commit(
                    setPeople(
                      people.map((x, j) =>
                        j === i ? { name: d.name.trim(), role: d.role.trim() } : x
                      )
                    ),
                    key,
                    key
                  )
                }
              />
            ) : (
              <Row
                key={key}
                rowKey={key}
                shared={null}
                saved={tick(key)}
                what={p.name}
                onEdit={() => setEditing(key)}
                onDelete={() =>
                  setDel({
                    title: t('manual.people.deleteTitle'),
                    quote: `${p.name}, ${p.role}`,
                    keep: t('manual.people.keep'),
                    confirm: t('manual.people.confirm'),
                    next: setPeople(removeAt(people, i)),
                    focusId: PEOPLE
                  })
                }
              >
                <strong>{p.name}</strong>, {p.role}
              </Row>
            )
          })}
          {editing === `${PEOPLE}:${NEW}` && (
            <Editor
              kind="person"
              onCancel={() => cancel(`${PEOPLE}:${NEW}`)}
              onSave={(d) => {
                const key = `${PEOPLE}:${people.length}`
                return commit(
                  setPeople([...people, { name: d.name.trim(), role: d.role.trim() }]),
                  key,
                  key
                )
              }}
            />
          )}
        </Block>
      </div>

      <ConfirmDelete
        open={del !== null}
        title={del?.title ?? ''}
        quote={del?.quote ?? ''}
        keep={del?.keep ?? ''}
        confirm={del?.confirm ?? ''}
        failed={delFailed}
        onKeep={() => {
          setDel(null)
          setDelFailed(false)
        }}
        onConfirm={confirmDelete}
      />
    </Shell>
  )
}

function Shell(props: {
  index?: React.ReactNode
  header?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-[calc(15rem+2rem+44rem)] gap-8 p-6">
      {props.index}
      <main className="w-full max-w-[44rem] min-w-0">
        <header className="mb-6">
          {props.header ?? <h1 className="text-2xl font-bold">{t('manual.title')}</h1>}
        </header>
        {props.children}
      </main>
    </div>
  )
}

export default Manual
