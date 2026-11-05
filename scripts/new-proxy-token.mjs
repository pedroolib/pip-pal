// Creates the proxy's access token, or replaces it if it leaked. Run from the repo root: node scripts/new-proxy-token.mjs
// The token goes to the Worker's secrets and to .env (gitignored), and is never printed.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const token = randomBytes(32).toString('base64url')
const secret = spawnSync(
  'npx wrangler secret put PIP_ACCESS_TOKEN --config src/proxy/wrangler.toml',
  { input: token, shell: true, stdio: ['pipe', 'inherit', 'inherit'] }
)
if (secret.status !== 0) {
  console.error('The Worker did not take the token, so .env was not changed.')
  process.exit(1)
}

const lines = existsSync('.env') ? readFileSync('.env', 'utf8').split(/\r?\n/) : []
const kept = lines.filter((line) => line && !line.startsWith('PIP_ACCESS_TOKEN='))
writeFileSync('.env', [...kept, `PIP_ACCESS_TOKEN=${token}`, ''].join('\n'))
console.log('Done. The token is in .env as PIP_ACCESS_TOKEN. Share it with the team privately.')
