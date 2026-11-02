// Which Claude model decodes. `PIP_MODEL=sonnet|haiku`, default haiku.
const MODELS = { sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' } as const

export function resolveModel(value = process.env.PIP_MODEL): string {
  if (!value) return MODELS.haiku
  if (Object.hasOwn(MODELS, value)) return MODELS[value as keyof typeof MODELS]
  throw new Error(`Unknown PIP_MODEL "${value}". Valid values: ${Object.keys(MODELS).join(', ')}.`)
}
