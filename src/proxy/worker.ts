// Cloudflare Worker that holds the API keys, so nobody running Pip needs one.
// It sees scrubbed text in transit: it must never log or store a request or a response.
// shortcut: one token shared by the team, so a leak means replacing it for everyone (scripts/new-proxy-token.mjs);
// upgrade to one endpoint per action and per-person licenses after the Launchpad.

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5']
const MAX_TOKENS = 8192 // what src/main/ai/clients.ts asks for
const MAX_BODY_CHARS = 256 * 1024
// Only the fields Pip sends: anything else (tools, thinking, streaming) is someone else's use of the key.
const CLAUDE_FIELDS = new Set(['model', 'max_tokens', 'system', 'messages', 'output_config'])

export interface Env {
  ANTHROPIC_API_KEY: string
  TYPESAFE_API_KEY: string
  PIP_ACCESS_TOKEN: string
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> }
}

function isPipClaudeCall(raw: string): boolean {
  let body: Record<string, unknown> | null
  try {
    body = JSON.parse(raw)
  } catch {
    return false
  }
  return (
    !!body &&
    typeof body === 'object' &&
    Object.keys(body).every((k) => CLAUDE_FIELDS.has(k)) &&
    CLAUDE_MODELS.includes(body.model as string) &&
    typeof body.max_tokens === 'number' &&
    body.max_tokens <= MAX_TOKENS
  )
}

const ROUTES: Record<
  string,
  { url: string; headers: (env: Env) => Record<string, string>; allows: (raw: string) => boolean }
> = {
  '/anthropic/v1/messages': {
    url: 'https://api.anthropic.com/v1/messages',
    headers: (env) => ({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }),
    allows: isPipClaudeCall
  },
  '/typesafe/v1/systemone': {
    url: 'https://api.typesafe.ai/v1/systemone',
    headers: (env) => ({ Authorization: `Bearer ${env.TYPESAFE_API_KEY}` }),
    allows: () => true
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (request.method !== 'POST' || !Object.hasOwn(ROUTES, pathname))
      return new Response(null, { status: 404 })
    const route = ROUTES[pathname]

    // Each SDK sends the token as its API key: Claude's in x-api-key, Jev's as a bearer token.
    const token =
      request.headers.get('x-api-key') ??
      request.headers.get('authorization')?.replace(/^Bearer /, '')
    if (!env.PIP_ACCESS_TOKEN || token !== env.PIP_ACCESS_TOKEN)
      return new Response(null, { status: 401 })

    const key = request.headers.get('cf-connecting-ip') ?? 'unknown'
    if (!(await env.LIMITER.limit({ key })).success) return new Response(null, { status: 429 })

    const raw = await request.text()
    if (raw.length > MAX_BODY_CHARS) return new Response(null, { status: 413 })
    if (!route.allows(raw)) return new Response(null, { status: 400 })

    const res = await fetch(route.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...route.headers(env) },
      body: raw
    })
    // Only the status and the body go back: the provider's other headers identify our accounts.
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
    })
  }
}
