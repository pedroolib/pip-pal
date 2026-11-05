// With the team's access token and no personal key, the AI calls go to the hosted proxy (src/proxy/),
// which checks the token and adds the real key. Both SDKs read these variables. The URL is not a secret.
export const PROXY_URL = 'https://pip-proxy.pip-pal.workers.dev'

/**
 * Without a token or a key, nothing changes and Pip answers from the demo fixtures.
 * A person's own key goes direct and never reaches the proxy. Call before any client is created.
 */
export function useProxyWithToken(env: NodeJS.ProcessEnv = process.env): void {
  const token = env.PIP_ACCESS_TOKEN
  if (!token) return
  if (!env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_BASE_URL = `${PROXY_URL}/anthropic`
    env.ANTHROPIC_API_KEY = token
  }
  if (!env.TYPESAFE_API_KEY) {
    env.TYPESAFE_BASE_URL = `${PROXY_URL}/typesafe`
    env.TYPESAFE_API_KEY = token
  }
}
