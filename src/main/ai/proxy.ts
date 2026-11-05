// Without a personal key, the AI calls go to the hosted proxy (src/proxy/), which adds the real one.
// Both SDKs read these variables. The URL and the placeholder are not secrets.
export const PROXY_URL = 'https://pip-proxy.pip-pal.workers.dev'
const PLACEHOLDER_KEY = 'pip-proxy'

/** A person's own key goes direct and never reaches the proxy. Call before any client is created. */
export function useProxyWithoutKeys(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_BASE_URL = `${PROXY_URL}/anthropic`
    env.ANTHROPIC_API_KEY = PLACEHOLDER_KEY
  }
  if (!env.TYPESAFE_API_KEY) {
    env.TYPESAFE_BASE_URL = `${PROXY_URL}/typesafe`
    env.TYPESAFE_API_KEY = PLACEHOLDER_KEY
  }
}
