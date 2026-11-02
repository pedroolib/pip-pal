/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS script, no types to annotate */
// A small side-by-side of the real expander on 3 fictional messages, printed and saved to scripts/.out.
//   npm run ai:lite                  sonnet and haiku (needs ANTHROPIC_API_KEY, from the env or .env)
//   npm run ai:lite -- haiku         only the models named
// PIP_ENV_FILE picks another env file (a missing one is ignored). Every call is a real, paid request.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

try {
  process.loadEnvFile(process.env.PIP_ENV_FILE)
} catch {
  // no env file: keys may come from the environment
}

// vague change + task, clear control (questions should come back empty or near it), vague ask without a change.
const IDS = ['demo-project-change', 'plain-request', 'vague-ask']
const args = process.argv.slice(2)
const models = args.length ? args : ['sonnet', 'haiku']
const root = resolve(import.meta.dirname, '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!process.env.ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY is not set (put it in .env).')

const server = await createServer({
  root,
  logLevel: 'error',
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, ws: false },
  resolve: { alias: { '@shared': resolve(root, 'src/shared') } }
})

try {
  const load = (path) => server.ssrLoadModule(path)
  const { Profile } = await load('/src/shared/schemas.ts')
  const { resolveModel } = await load('/src/main/ai/models.ts')
  // A typo would otherwise fail every call.
  for (const model of models) {
    try {
      resolveModel(model)
    } catch (e) {
      fail(e.message)
    }
  }
  const { createClaudeClient } = await load('/src/main/ai/clients.ts')
  const { createExpander } = await load('/src/main/ai/expand.ts')
  const { formatLite, plannedCalls } = await load('/src/main/ai/compare-lite.ts')

  const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  const all = read('scripts/compare-messages.json')
  const profile = Profile.parse(read('src/shared/fixtures/sam.profile.json'))
  const expand = createExpander({ claude: createClaudeClient() })

  const sections = []
  for (const id of IDS) {
    const m = all.find((x) => x.id === id)
    if (!m) fail(`Message "${id}" is missing from scripts/compare-messages.json.`)
    const kinds = []
    for (const { kind, unclear } of plannedCalls(m)) {
      const answers = []
      for (const model of models) {
        process.env.PIP_MODEL = model // the client resolves it on every call
        const start = performance.now()
        let output = null
        let error = null
        try {
          output = await expand(m.text, kind, 3, profile, unclear)
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        }
        answers.push({ model, ms: Math.round(performance.now() - start), output, error })
      }
      kinds.push({ kind, answers })
    }
    sections.push({ id, text: m.text, kinds })
  }

  const md = formatLite(sections)
  console.log(md)
  mkdirSync(resolve(root, 'scripts/.out'), { recursive: true })
  const file = resolve(
    root,
    `scripts/.out/lite-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  )
  writeFileSync(file, md)
  console.log(`Saved: ${file}`)
} finally {
  await server.close()
}
