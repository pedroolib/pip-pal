import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { APIError } from '@typesafe-ai/sdk'
import { createClaudeClient, createTriageJevClient } from './clients'

const fake = (create: (p: unknown) => unknown): never =>
  ({ messages: { create: vi.fn(async (p) => create(p)) } }) as never

describe('createClaudeClient', () => {
  it('asks for the tool with auto tool_choice (never forced) and returns its input', async () => {
    const create = vi.fn(async (...args: unknown[]) => ({
      args,
      content: [
        { type: 'text', text: 'hi' },
        { type: 'tool_use', input: { a: 1 } }
      ]
    }))
    const out = await createClaudeClient(fake(create)).decode({ system: 'S', user: 'U' })
    expect(out).toEqual({ a: 1 })
    const p = create.mock.calls[0][0] as Record<string, unknown>
    expect(p.tool_choice).toEqual({ type: 'auto' })
    expect(p.thinking).toBeUndefined()
    expect(p.system).toMatch(/^S\n\n.*decode_message/)
  })

  it('ask() sends the given tool and names it in the closing rule', async () => {
    const create = vi.fn(async (...args: unknown[]) => ({
      args,
      content: [{ type: 'tool_use', input: { b: 2 } }]
    }))
    const tool = { name: 'list_steps', description: 'D', input_schema: { type: 'object' as const } }
    const out = await createClaudeClient(fake(create)).ask({ system: 'S', user: 'U', tool })
    expect(out).toEqual({ b: 2 })
    const p = create.mock.calls[0][0] as Record<string, unknown>
    expect(p.tools).toEqual([tool])
    expect(p.tool_choice).toEqual({ type: 'auto' })
    expect(p.system).toMatch(/^S\n\nAnswer only by calling the list_steps tool\./)
  })

  it('returns undefined without a tool_use block, which the decoder treats as invalid', async () => {
    const c = createClaudeClient(fake(async () => ({ content: [{ type: 'text', text: 'hi' }] })))
    expect(await c.decode({ system: 'S', user: 'U' })).toBeUndefined()
  })

  it('reports only the status of an API error, never its message or the request text', async () => {
    const err = new Anthropic.BadRequestError(
      400,
      { type: 'error', error: { type: 'invalid_request_error', message: 'bad thing' } },
      undefined,
      new Headers()
    )
    const c = createClaudeClient(
      fake(async () => {
        throw err
      })
    )
    await expect(c.decode({ system: 'S', user: 'SECRET' })).rejects.toThrow(
      /^Claude API error 400$/
    )
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
