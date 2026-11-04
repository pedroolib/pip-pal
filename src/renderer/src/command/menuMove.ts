// Where a key moves the menu's selection, as in a native menu: with nothing selected, down starts at the first row and
// up at the last. Null when the key doesn't move it.
export function menuMove(key: string, index: number | null, count: number): number | null {
  const last = count - 1
  if (key === 'ArrowDown' || key === 'Tab') return index === null || index === last ? 0 : index + 1
  if (key === 'ArrowUp' || key === 'Shift+Tab') return index === null || index === 0 ? last : index - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  return null
}
