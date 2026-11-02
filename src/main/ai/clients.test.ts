import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { APIError } from '@typesafe-ai/sdk'
import { z } from 'zod'
import samJson from '@shared/fixtures/sam.profile.json'
import { Profile } from '@shared/schemas'
import { createClaudeClient, createTriageJevClient } from './clients'
import { createDecoder } from './decoder'
import { createExpander } from './expand'

type Params = Record<string, unknown>
const reply = (text: string | null, stop_reason = 'end_turn'): unknown => ({
  stop_reason,
  content: text === null ? [] : [{ type: 'text', text }]
})
const fake = (
  respond: (p: Params) => unknown
): { client: never; create: ReturnType<typeof vi.fn> } => {
  const create = vi.fn(async (p: Params) => respond(p))
  return { client: { messages: { create } } as never, create }
}

describe('createClaudeClient', () => {
  it('asks for JSON output with the schema and no tools, and returns the parsed answer', async () => {
    const { client, create } = fake(() => reply('{"a":1}'))
    const schema = z.object({ a: z.number() })
    expect(await createClaudeClient(client).ask({ system: 'S', user: 'U', schema })).toEqual({
      a: 1
    })
    expect(create).toHaveBeenCalledTimes(1)
    const p = create.mock.calls[0][0] as Params
    expect(p.system).toBe('S')
    expect(p.messages).toEqual([{ role: 'user', content: 'U' }])
    expect(p.tools).toBeUndefined()
    expect(p.tool_choice).toBeUndefined()
    expect(p.thinking).toBeUndefined()
    expect(p.output_config).toEqual({
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { a: { type: 'number' } },
          required: ['a'],
          additionalProperties: false
        }
      }
    })
  })

  it('decode() sends the decode schema and returns the parsed answer', async () => {
    const { client, create } = fake(() => reply('{"decode":{}}'))
    expect(await createClaudeClient(client).decode({ system: 'S', user: 'U' })).toEqual({
      decode: {}
    })
    const format = (create.mock.calls[0][0] as { output_config: { format: { schema: Params } } })
      .output_config.format
    expect(Object.keys(format.schema.properties as Params).sort()).toEqual([
      'classification',
      'decode'
    ])
  })

  it('moves unsupported constraints into the description and keeps enums', async () => {
    const { client, create } = fake(() => reply('{}'))
    const schema = z.object({
      p: z.number().min(0).max(1),
      s: z.string().min(1).describe('Name'),
      e: z.enum(['a', 'b']),
      l: z.array(z.string()).min(2).max(5)
    })
    await createClaudeClient(client).ask({ system: 'S', user: 'U', schema })
    const sent = (create.mock.calls[0][0] as { output_config: { format: { schema: Params } } })
      .output_config.format.schema
    expect(sent.properties).toEqual({
      p: { type: 'number', description: '{"minimum":0,"maximum":1}' },
      s: { type: 'string', description: 'Name\n\n{"minLength":1}' },
      e: { type: 'string', enum: ['a', 'b'] },
      l: { type: 'array', items: { type: 'string' }, description: '{"maxItems":5,"minItems":2}' }
    })
  })

  it('restores the exact casing of enum values, and only of enum values', async () => {
    const answer = { e: 'B', list: [{ e: 'A', t: 'Free Text' }], opt: { e: 'b' }, n: null }
    const { client } = fake(() => reply(JSON.stringify(answer)))
    const E = z.enum(['a', 'b'])
    const schema = z.object({
      e: E,
      list: z.array(z.object({ e: E, t: z.string() })),
      opt: z.object({ e: E }).nullable(),
      n: z.object({ e: E }).nullable()
    })
    expect(await createClaudeClient(client).ask({ system: 'S', user: 'U', schema })).toEqual({
      e: 'b',
      list: [{ e: 'a', t: 'Free Text' }],
      opt: { e: 'b' },
      n: null
    })
  })

  it.each([
    ['refusal', 'Claude declined to answer.'],
    ['max_tokens', "Claude's answer was cut off (max_tokens)."]
  ])(
    'rejects stop_reason %s after exactly one call, without reading the text',
    async (stop, msg) => {
      const { client, create } = fake(() => reply('{"LEAKED":1', stop))
      const err = await createClaudeClient(client)
        .decode({ system: 'S', user: 'U' })
        .catch((e: Error) => e)
      expect((err as Error).message).toBe(msg)
      expect(create).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    ['no text block', null],
    ['an empty text block', '  ']
  ])('rejects an answer with %s', async (_, text) => {
    const { client, create } = fake(() => reply(text))
    await expect(createClaudeClient(client).decode({ system: 'S', user: 'U' })).rejects.toThrow(
      /^Claude returned an empty answer\.$/
    )
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('rejects text that is not JSON, without quoting it', async () => {
    const { client, create } = fake(() => reply('LEAKED-OUTPUT {'))
    const err = await createClaudeClient(client)
      .decode({ system: 'S', user: 'U' })
      .catch((e: Error) => e)
    expect((err as Error).message).toBe("Claude's answer was not valid JSON.")
    expect(String(err)).not.toContain('LEAKED')
    expect((err as Error).cause).toBeUndefined()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('reports only the status of an API error, never its message or the request text', async () => {
    const err = new Anthropic.BadRequestError(
      400,
      { type: 'error', error: { type: 'invalid_request_error', message: 'bad thing' } },
      undefined,
      new Headers()
    )
    const { client } = fake(() => {
      throw err
    })
    await expect(
      createClaudeClient(client).decode({ system: 'S', user: 'SECRET' })
    ).rejects.toThrow(/^Claude API error 400$/)
  })
})

// Every schema the app sends must fit the structured-outputs subset, or the API answers 400.
describe('every schema sent to Claude', () => {
  const FORMATS = [
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
  ]
  const BANNED = [
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'maxItems',
    '$schema',
    'oneOf'
  ]
  function check(node: Params, path: string): void {
    for (const k of BANNED) expect(node, `${k} at ${path}`).not.toHaveProperty(k)
    if (node.format !== undefined) expect(FORMATS, `format at ${path}`).toContain(node.format)
    if (node.minItems !== undefined) expect([0, 1], `minItems at ${path}`).toContain(node.minItems)
    if (node.type === 'object' || node.properties)
      expect(node.additionalProperties, `additionalProperties at ${path}`).toBe(false)
    for (const [k, v] of Object.entries((node.properties ?? {}) as Record<string, Params>))
      check(v, `${path}.${k}`)
    for (const [k, v] of Object.entries((node.$defs ?? {}) as Record<string, Params>))
      check(v, `${path}.$defs.${k}`)
    if (node.items) check(node.items as Params, `${path}[]`)
    for (const key of ['anyOf', 'allOf'])
      ((node[key] ?? []) as Params[]).forEach((v, i) => check(v, `${path}.${key}${i}`))
  }

  it('decode, steps, questions and transition all fit the supported subset', async () => {
    const schemas: Params[] = []
    const { client } = fake((p) => {
      schemas.push((p.output_config as { format: { schema: Params } }).format.schema)
      return reply('{}')
    })
    const claude = createClaudeClient(client)
    const profile = Profile.parse(samJson)
    await createDecoder({ claude, jev: null })('New project.', 3, profile).catch(() => {})
    const expand = createExpander({ claude })
    for (const kind of ['steps', 'questions', 'transition'] as const)
      await expand('New project.', kind, 3, profile).catch(() => {})
    expect(schemas).toHaveLength(4)
    schemas.forEach((s, i) => check(s, `schema${i}`))
  })
})

describe('createTriageJevClient', () => {
  const systemOne = (impl: (r: unknown) => unknown): never =>
    ({ systemOne: vi.fn(async (r) => impl(r)) }) as never

  it('sends state and questions in one request and returns the answers', async () => {
    const calls: unknown[] = []
    const c = createTriageJevClient(
      systemOne((r) => {
        calls.push(r)
        return { answers: { isChange: { noul: 0.9 } } }
      })
    )
    const req = { state: { message: 'M' }, questions: { isChange: { type: 'noul' } } }
    expect(await c.ask(req)).toEqual({ isChange: { noul: 0.9 } })
    expect(calls).toEqual([req])
  })

  it('reports only the status of an API error, never its body', async () => {
    const c = createTriageJevClient(
      systemOne(() => {
        throw new APIError(422, { detail: 'SECRET label' }, new Headers())
      })
    )
    await expect(c.ask({ state: { message: 'SECRET' }, questions: {} })).rejects.toThrow(
      /^Jev API error 422$/
    )
  })
})
