import Anthropic from '@anthropic-ai/sdk'
import { noul } from '@typesafe-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createClaudeClient, createTriageJevClient } from '../main/ai/clients'
import { resolveModel } from '../main/ai/models'
import { useProxyWithToken } from '../main/ai/proxy'
import worker, { CLAUDE_MODELS, type Env } from './worker'

const PROXY = 'https://proxy.test'
const TOKEN = 'team-token'
const WITH_TOKEN = { 'x-api-key': TOKEN }
const VALID = {
  model: 'claude-haiku-5-5',
  max_tokens: 8192,
  system: 's',
  messages: [{ role: 'user', content: 'hi' }]
}

let limited: boolean
let upstream: Request[]
let answer: () => Response
const env: Env = {
  ANTHROPIC_API_KEY: 'real-claude',
  TYPESAFE_API_KEY: 'real-jev',
  PIP_ACCESS_TOKEN: TOKEN,
  LIMITER: { limit: async () => ({ success: !limited }) }
}

// The proxy's host runs the Worker; any other host is a provider.
beforeEach(() => {
  limited = false
  upstream = []
  answer = () => Response.json({ ok: true })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.url.startsWith(PROXY)) return worker.fetch(request, env)
    upstream.push(request)
    return answer()
  })
})
afterEach(() => vi.unstubAllGlobals())

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${PROXY}${path}`, { method: 'POST', headers: WITH_TOKEN, body: JSON.stringify(body) })

describe('proxy worker', () => {
  it.each([
    ['no token', {}],
    ['a wrong token', { 'x-api-key': 'guess' }],
    ['a wrong bearer token', { authorization: 'Bearer guess' }]
  ])('refuses a valid call with %s before calling a provider', async (_, headers) => {
    const res = await fetch(`${PROXY}/anthropic/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(VALID)
    })
    expect(res.status).toBe(401)
    expect(upstream).toEqual([])
  })

  it('refuses everyone if the secret is missing from the Worker', async () => {
    const noSecret = { ...env, PIP_ACCESS_TOKEN: '' }
    const asks: HeadersInit[] = [{}, { 'x-api-key': '' }]
    for (const headers of asks) {
      const request = new Request(`${PROXY}/anthropic/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(VALID)
      })
      expect((await worker.fetch(request, noSecret)).status).toBe(401)
    }
    expect(upstream).toEqual([])
  })

  it('lets the real SDKs reach Claude with the server key, never the token', async () => {
    answer = () =>
      Response.json({
        content: [{ type: 'text', text: '{"a":1}' }],
        stop_reason: 'end_turn'
      })
    const sdk = new Anthropic({ apiKey: TOKEN, baseURL: `${PROXY}/anthropic` })
    const out = await createClaudeClient(sdk).ask({
      system: 's',
      user: 'u',
      schema: z.object({ a: z.number() })
    })
    expect(out).toEqual({ a: 1 })
    expect(upstream[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(upstream[0].headers.get('x-api-key')).toBe('real-claude')
  })

  it('passes on a large Jev request as JSON the provider can read', async () => {
    answer = () => Response.json({ answers: {} })
    vi.stubEnv('TYPESAFE_API_KEY', TOKEN)
    vi.stubEnv('TYPESAFE_BASE_URL', `${PROXY}/typesafe`)
    const message = 'a long message '.repeat(400)
    await createTriageJevClient().ask({
      state: { message },
      questions: { yes: noul('Is it?', { true: 'yes', false: 'no' }) }
    })
    vi.unstubAllEnvs()
    expect((await upstream[0].json()).state.message).toBe(message)
  })

  it('lets the real SDK reach Jev with the server key, never the token', async () => {
    answer = () => Response.json({ answers: { yes: { value: true, probability: 0.9 } } })
    vi.stubEnv('TYPESAFE_API_KEY', TOKEN)
    vi.stubEnv('TYPESAFE_BASE_URL', `${PROXY}/typesafe`)
    await createTriageJevClient().ask({
      state: { message: 'm' },
      questions: { yes: noul('Is it?', { true: 'yes', false: 'no' }) }
    })
    vi.unstubAllEnvs()
    expect(upstream[0].url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(upstream[0].headers.get('authorization')).toBe('Bearer real-jev')
  })

  it.each([
    ['another model', { ...VALID, model: 'claude-opus-5-5' }],
    ['too many tokens', { ...VALID, max_tokens: 8193 }],
    ['no max_tokens', { model: VALID.model, messages: VALID.messages }],
    ['a field Pip never sends', { ...VALID, tools: [{ name: 'web_search' }] }],
    ['streaming', { ...VALID, stream: true }],
    ['null', null]
  ])('refuses a Claude call with %s', async (_, body) => {
    expect((await post('/anthropic/v1/messages', body)).status).toBe(400)
    expect(upstream).toEqual([])
  })

  it('refuses a body that is not JSON, one too large, and unknown paths or methods', async () => {
    const send = (path: string, init: RequestInit): Promise<Response> =>
      fetch(`${PROXY}${path}`, { headers: WITH_TOKEN, ...init })
    const big = 'x'.repeat(256 * 1024 + 1)
    const statuses = await Promise.all([
      send('/anthropic/v1/messages', { method: 'POST', body: 'nope' }),
      send('/typesafe/v1/systemone', { method: 'POST', body: big }),
      send('/anthropic/v1/models', { method: 'POST', body: '{}' }),
      send('/__proto__', { method: 'POST', body: '{}' }),
      send('/anthropic/v1/messages', { method: 'GET' })
    ])
    expect(statuses.map((r) => r.status)).toEqual([400, 413, 404, 404, 404])
    expect(upstream).toEqual([])
  })

  it('stops a caller over the rate limit before calling a provider', async () => {
    limited = true
    expect((await post('/anthropic/v1/messages', VALID)).status).toBe(429)
    expect(upstream).toEqual([])
  })

  it('returns the provider status and body, without its other headers', async () => {
    answer = () =>
      new Response('{"error":1}', {
        status: 503,
        headers: { 'content-type': 'application/json', 'anthropic-organization-id': 'org' }
      })
    const res = await post('/anthropic/v1/messages', VALID)
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('{"error":1}')
    expect(res.headers.has('anthropic-organization-id')).toBe(false)
  })

  it('allows every model the app can pick', () => {
    expect(CLAUDE_MODELS).toEqual([resolveModel('sonnet'), resolveModel('haiku')])
  })
})

describe('useProxyWithToken', () => {
  it('points an app with the token and no keys at the proxy', () => {
    const e: NodeJS.ProcessEnv = { PIP_ACCESS_TOKEN: TOKEN, ANTHROPIC_API_KEY: '' }
    useProxyWithToken(e)
    expect(e.ANTHROPIC_BASE_URL).toMatch(/\/anthropic$/)
    expect(e.TYPESAFE_BASE_URL).toMatch(/\/typesafe$/)
    expect(e.ANTHROPIC_API_KEY).toBe(TOKEN)
    expect(e.TYPESAFE_API_KEY).toBe(TOKEN)
  })

  it('leaves a clone without a token on the demo fixtures', () => {
    const e: NodeJS.ProcessEnv = {}
    useProxyWithToken(e)
    expect(e).toEqual({})
  })

  it('never sends a personal key to the proxy', () => {
    const mine = { PIP_ACCESS_TOKEN: TOKEN, ANTHROPIC_API_KEY: 'mine', TYPESAFE_API_KEY: 'mine' }
    const e: NodeJS.ProcessEnv = { ...mine }
    useProxyWithToken(e)
    expect(e).toEqual(mine)
  })
})
