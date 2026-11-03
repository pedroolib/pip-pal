// Pip peeking over a card's top edge, like the task card reference: half above the card, half on it.
// Outside the card, so the card's own scrolling never clips Pip.
export function PeekingPip({
  pip,
  children
}: {
  /** A <Pip> at size 40. */
  pip: React.ReactNode
  /** The card. */
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="relative flex min-h-0 w-full flex-col pt-5">
      <div className="motion-pop absolute top-0 left-5 z-10">{pip}</div>
      {children}
    </div>
  )
}
