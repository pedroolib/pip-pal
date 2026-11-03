// A step's text with its shortcuts drawn as key caps, like the task card reference.
import { Fragment } from 'react'
import { splitKeys } from './keys'

export function WithKeys({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {splitKeys(text).map((p, i) =>
        'text' in p ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : (
          <span key={i} className="whitespace-nowrap">
            {p.keys.map((k, j) => (
              <Fragment key={j}>
                {j > 0 && <span className="mx-1 text-muted-foreground">+</span>}
                <kbd className="rounded-md border bg-card px-1.5 py-0.5 font-sans text-[0.85em] font-bold shadow-[0_1px_0_var(--border)]">
                  {k}
                </kbd>
              </Fragment>
            ))}
          </span>
        )
      )}
    </>
  )
}
