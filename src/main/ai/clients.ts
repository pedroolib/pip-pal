// The real SDK clients. Keys come only from process.env (each SDK reads its own variable), in main only.
// Logging is off in both: their debug levels would print request bodies.
import Anthropic from '@anthropic-ai/sdk'
import type { ClaudeJsonClient } from './expand'
import { APIError, TypeSafeClient, type Questions } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { DecodeOutput, JEV_TIMEOUT_MS, type ClaudeClient, type JevClient } from './decoder'
import { JEV_QUESTIONS, toClassification } from './jev-questions'
import { resolveModel } from './models'
import type { TriageJevClient } from './triage'

type Schema = Record<string, unknown>

/**
 * Reads ANTHROPIC_API_KEY. The model is resolved per call, so a bad PIP_MODEL fails the call, not startup.
 * Structured outputs: the answer is JSON constrained to the schema, so there is no tool and no retry.
 * `ask` takes any Zod schema (the expander passes one per kind); `decode` is `ask` with the decode schema.
 */
export function createClaudeClient(
  // maxRetries 0: nothing retries, an invalid answer rejects at once. openTelemetry false: no message content in spans.
  client: Pick<Anthropic, 'messages'> = new Anthropic({
    timeout: 30_000,
    maxRetries: 0,
    openTelemetry: false,
    logLevel: 'off'
  })
): ClaudeClient & ClaudeJsonClient {
  const ask: ClaudeJsonClient['ask'] = async ({ system, user, schema }) => {
    // A new schema compiles once (extra latency on first use, then cached); changing it resets the prompt cache.
    const json = toOutputSchema(schema)
    let res: Anthropic.Message
    try {
      res = await client.messages.create({
        model: resolveModel(),
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
        // effort: thinking depth and token spend; low suits latency-sensitive routes.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: json } }
      })
    } catch (e) {
      // Status only, like the Jev client: neither the API's message nor the request (it holds the user's text).
      // eslint-disable-next-line preserve-caught-error -- no cause on purpose, it holds the API body
      if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}`)
      throw e
    }
    // Neither is guaranteed to match the schema, so the text is never read.
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer.')
    if (res.stop_reason === 'max_tokens')
      throw new Error("Claude's answer was cut off (max_tokens).")
    const text = res.content.find((b) => b.type === 'text')?.text
    if (!text?.trim()) throw new Error('Claude returned an empty answer.')
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      // The parser's message quotes the text, so it is dropped.
      throw new Error("Claude's answer was not valid JSON.")
    }
    return fixEnumCase(json, value)
  }
  return { ask, decode: (req) => ask({ ...req, schema: DecodeOutput }) }
}

const FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'uri',
  'ipv4',
  'ipv6',
  'uuid'
])
// prettier-ignore
const UNSUPPORTED = ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxItems']

/**
 * A Zod schema in the subset structured outputs accept (anything else is a 400): every object closed, and
 * unsupported constraints moved into the description as hints. Zod still checks them on the answer.
 */
function toOutputSchema(schema: z.ZodType): Schema {
  return strict(z.toJSONSchema(schema) as Schema)
}
function strict(node: Schema): Schema {
  const { oneOf, anyOf, allOf, properties, items, $defs, ...out } = node
  delete out.$schema
  const moved: Schema = {}
  const move = (k: string): void => {
    moved[k] = out[k]
    delete out[k]
  }
  UNSUPPORTED.filter((k) => k in out).forEach(move)
  if (out.format !== undefined && !FORMATS.has(out.format as string)) move('format')
  if (typeof out.minItems === 'number' && out.minItems > 1) move('minItems')
  if (Object.keys(moved).length)
    out.description = [out.description, JSON.stringify(moved)].filter(Boolean).join('\n\n')
  const each = (o: unknown): Schema =>
    Object.fromEntries(Object.entries(o as Schema).map(([k, v]) => [k, strict(v as Schema)]))
  const variants = anyOf ?? oneOf
  if (Array.isArray(variants)) out.anyOf = variants.map(strict)
  if (Array.isArray(allOf)) out.allOf = allOf.map(strict)
  if (items) out.items = strict(items as Schema)
  if (properties) out.properties = each(properties)
  if ($defs) out.$defs = each($defs)
  if (out.type === 'object' || properties) out.additionalProperties = false
  return out
}

/** Enum values may come back in another capitalization: restore the schema's exact casing (enum fields only). */
function fixEnumCase(schema: Schema, value: unknown): unknown {
  if (typeof value === 'string' && Array.isArray(schema.enum))
    return schema.enum.find((e) => String(e).toLowerCase() === value.toLowerCase()) ?? value
  let v = value
  if (Array.isArray(v) && schema.items) v = v.map((x) => fixEnumCase(schema.items as Schema, x))
  else if (v && typeof v === 'object' && schema.properties) {
    const props = schema.properties as Record<string, Schema>
    v = Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, props[k] ? fixEnumCase(props[k], x) : x])
    )
  }
  for (const s of (schema.anyOf ?? []) as Schema[]) v = fixEnumCase(s, v)
  return v
}

/** Reads TYPESAFE_API_KEY. Failures and timeouts reject; the decoder then uses Claude's classification. */
export function createJevClient(): JevClient {
  const client = new TypeSafeClient({
    timeout: JEV_TIMEOUT_MS,
    retry: { maxRetries: 0 },
    logLevel: 'off',
    compression: false // the proxy reads bodies as text; a compressed one reaches Jev garbled (422)
  })
  return {
    async classify(text) {
      const { answers } = await client.systemOne({
        state: { message: text },
        questions: JEV_QUESTIONS
      })
      return toClassification(answers)
    }
  }
}

// ---------- Jev for triage (one bundled request per message) ----------

/** Reads TYPESAFE_API_KEY. Errors keep only the HTTP status: an API error body may quote the request. */
export function createTriageJevClient(
  client: Pick<TypeSafeClient, 'systemOne'> = new TypeSafeClient({
    timeout: JEV_TIMEOUT_MS,
    retry: { maxRetries: 0 },
    logLevel: 'off',
    compression: false // see createJevClient
  })
): TriageJevClient {
  return {
    async ask({ state, questions }) {
      const { answers } = await client
        .systemOne({ state, questions: questions as Questions })
        .catch((e: unknown) => {
          // No cause on purpose: the caught error's body or message may quote the request.
          const status = e instanceof APIError ? e.status : null
          throw new Error(status ? `Jev API error ${status}` : 'Jev request failed.')
        })
      return answers
    }
  }
}
