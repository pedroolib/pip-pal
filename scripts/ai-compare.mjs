/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS script, no types to annotate */
// Runs the real decoder over scripts/compare-messages.json once per model and prints a comparison table.
//   npm run ai:compare -- sonnet haiku        (needs ANTHROPIC_API_KEY, optional TYPESAFE_API_KEY)
//   npm run ai:compare -- --dry sonnet haiku  (offline self-check with fake clients)
// TS is loaded through vite's ssrLoadModule (already installed), which resolves the @shared alias.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

try {
  process.loadEnvFile()
} catch {
  // no .env file: keys may come from the environment
}

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const models = args.filter((a) => !a.startsWith('--'))
const root = resolve(import.meta.dirname, '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!models.length) fail('Usage: npm run ai:compare -- [--dry] <sonnet|haiku> [...]')
if (!dry && !process.env.ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY is not set (put it in .env).')

// Nearest-rank percentile of a numeric list.
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] : null
}

const server = await createServer({
  root,
  logLevel: 'error',
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, ws: false },
  resolve: { alias: { '@shared': resolve(root, 'src/shared') } }
})

try {
  const { createDecoder } = await server.ssrLoadModule('/src/main/ai/decoder.ts')
  const { Profile } = await server.ssrLoadModule('/src/shared/schemas.ts')
  const { resolveModel } = await server.ssrLoadModule('/src/main/ai/models.ts')
  // A typo would otherwise fail every decode and hide the cause in the JSON file.
  for (const model of models) {
    try {
      resolveModel(model)
    } catch (e) {
      fail(e.message)
    }
  }
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const messages = read('scripts/compare-messages.json')
  const profile = Profile.parse(read('src/shared/fixtures/sam.profile.json'))

  let claude, jev
  if (dry) {
    // Fake clients: the first call for one message returns garbage so the retry path shows up.
    const demo = read('src/shared/fixtures/demo.decoded.json')
    let garbled = false
    claude = {
      async decode({ user }) {
        if (!garbled && user.includes('March sales')) {
          garbled = true
          return { nope: 1 }
        }
        const isChange = /moving|pasas|instead|pulled forward/i.test(user.split('\nMessage:\n')[1])
        const classification = { ...demo.classification, isChange: isChange ? 0.9 : 0.1 }
        delete classification.source
        return {
          classification,
          decode: { ...demo.decode, change: isChange ? demo.decode.change : null }
        }
      }
    }
    jev = null
  } else {
    const { createClaudeClient, createJevClient } =
      await server.ssrLoadModule('/src/main/ai/clients.ts')
    claude = createClaudeClient()
    jev = process.env.TYPESAFE_API_KEY ? createJevClient() : null
  }

  const report = []
  for (const model of models) {
    process.env.PIP_MODEL = model // the client resolves it on every call
    let calls = 0
    const decode = createDecoder({
      claude: { decode: (req) => (calls++, claude.decode(req)) },
      jev
    })
    const runs = []
    for (const m of messages) {
      const before = calls
      const start = performance.now()
      let output = null
      let error = null
      try {
        output = await decode(m.text, 3, profile)
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }
      runs.push({
        id: m.id,
        isChange: m.isChange,
        vague: m.vague,
        ms: Math.round(performance.now() - start),
        claudeCalls: calls - before,
        error,
        output
      })
    }
    const valid = runs.filter((r) => r.output)
    const vague = valid.filter((r) => r.vague)
    const matches = valid.filter((r) => (r.output.decode.change !== null) === r.isChange)
    report.push({
      model,
      runs,
      summary: {
        valid: `${valid.length}/${runs.length}`,
        retries: runs.reduce((n, r) => n + Math.max(0, r.claudeCalls - 1), 0),
        p50ms: percentile(
          runs.map((r) => r.ms),
          50
        ),
        p95ms: percentile(
          runs.map((r) => r.ms),
          95
        ),
        avgSteps: valid.length
          ? (valid.reduce((n, r) => n + r.output.decode.steps.length, 0) / valid.length).toFixed(1)
          : '-',
        // An invalid output counts as a mismatch, so the total is all messages.
        changeMatches: `${matches.length}/${runs.length}`,
        vagueUncertainties: `${vague.reduce((n, r) => n + r.output.decode.uncertainties.length, 0)} over ${vague.length} vague`
      }
    })
  }

  console.table(
    Object.fromEntries(report.map(({ model, summary }) => [model + (dry ? ' (dry)' : ''), summary]))
  )
  mkdirSync(resolve(root, 'scripts/.out'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = resolve(root, `scripts/.out/compare-${stamp}.json`)
  writeFileSync(file, JSON.stringify({ dry, labels: messages, report }, null, 2))
  console.log(`Full outputs: ${file}`)
} finally {
  await server.close()
}
