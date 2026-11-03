/** The text Copy puts on the clipboard: only the points the person left ticked. */
export const bullets = (points: { text: string; include: boolean }[]): string =>
  points
    .filter((p) => p.include)
    .map((p) => `- ${p.text}`)
    .join('\n')
