import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { createClaudeClient } from './clients'

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

  it('returns undefined without a tool_use block, which the decoder treats as invalid', async () => {
    const c = createClaudeClient(fake(async () => ({ content: [{ type: 'text', text: 'hi' }] })))
    expect(await c.decode({ system: 'S', user: 'U' })).toBeUndefined()
  })

  it('reports status and the API message on a 400, never the request text', async () => {
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
      /^Claude API error 400: bad thing$/
    )
  })
})
