/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS script, no types to annotate */
// Runs the real pipelines over scripts/compare-messages.json and prints comparison tables.
//   npm run ai:compare -- sonnet haiku              full decode (needs ANTHROPIC_API_KEY, optional TYPESAFE_API_KEY)
//   npm run ai:compare -- --triage                  Jev triage only (needs TYPESAFE_API_KEY)
//   npm run ai:compare -- --expand sonnet haiku     the three expansions per model (needs ANTHROPIC_API_KEY)
//   add --dry to any of them for an offline self-check with fake clients (checks the output shape only)
// Message text goes only to scripts/.out, never to the console.
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
const triageMode = args.includes('--triage')
const expandMode = args.includes('--expand')
const models = args.filter((a) => !a.startsWith('--'))
const root = resolve(import.meta.dirname, '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

const usage = 'Usage: npm run ai:compare -- [--dry] [--triage | --expand] <sonnet|haiku> [...]'
if (triageMode && expandMode) fail(usage)
if (triageMode ? models.length : !models.length) fail(usage)
const neededKey = triageMode ? 'TYPESAFE_API_KEY' : 'ANTHROPIC_API_KEY'
if (!dry && !process.env[neededKey]) fail(`${neededKey} is not set (put it in .env).`)

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

// Runs fn once; an error is kept as its message only (never the message content).
const timed = async (fn) => {
  const start = performance.now()
  let output = null
  let error = null
  try {
    output = await fn()
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  return { ms: Math.round(performance.now() - start), output, error }
}
const latency = (runs) => ({
  p50ms: percentile(
    runs.map((r) => r.ms),
    50
  ),
  p95ms: percentile(
    runs.map((r) => r.ms),
    95
  )
})
const invalidCount = (runs) =>
  runs.filter((r) => r.error && /^(Claude|Jev) returned an invalid /.test(r.error)).length
const average = (values) =>
  values.length ? (values.reduce((n, v) => n + v, 0) / values.length).toFixed(1) : '-'
const printFirstError = (name, runs) => {
  const failed = runs.find((r) => r.error) // error text only, never message content
  if (failed) console.log(`${name}: first error (${failed.id}): ${failed.error}`)
}

try {
  const { Profile } = await server.ssrLoadModule('/src/shared/schemas.ts')
  const { resolveModel } = await server.ssrLoadModule('/src/main/ai/models.ts')
  // A typo would otherwise fail every call and hide the cause in the JSON file.
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

  const save = (report) => {
    mkdirSync(resolve(root, 'scripts/.out'), { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const mode = triageMode ? 'triage' : expandMode ? 'expand' : 'compare'
    const file = resolve(root, `scripts/.out/${mode}${dry ? '-dry' : ''}-${stamp}.json`)
    writeFileSync(file, JSON.stringify({ dry, labels: messages, report }, null, 2))
    console.log(`Full outputs: ${file}`)
  }
  const tag = dry ? ' (dry)' : ''
  const dryNote = () => dry && console.log('DRY RUN: numbers are fake')

  if (triageMode) {
    // The date labels in compare-messages.json assume this day (a Wednesday); weeks start Monday.
    const now = () => new Date(2026, 9, 28, 9, 0)
    let triage
    if (dry) {
      const demo = read('src/shared/fixtures/demo.triage.json')
      let failed = false
      triage = async (text) => {
        if (!failed && text.includes('March sales')) {
          failed = true
          throw new Error('Jev returned an invalid triage answer.')
        }
        const change = /moving|pasas|instead|pulled forward/i.test(text)
        return {
          ...demo,
          type: { ...demo.type, value: change ? 'change' : 'request' },
          isChange: change ? 0.9 : 0.1,
          deadline: null
        }
      }
    } else {
      const { createTriager } = await server.ssrLoadModule('/src/main/ai/triage.ts')
      const { createTriageJevClient } = await server.ssrLoadModule('/src/main/ai/clients.ts')
      triage = createTriager({ jev: createTriageJevClient(), now })
    }

    const runs = []
    for (const m of messages)
      runs.push({ id: m.id, ...(await timed(() => triage(m.text, profile))) })
    const valid = runs.filter((r) => r.output)

    const labelled = (m) => ({ ...m, isChange: m.type === 'change' })
    const FIELDS = {
      type: { get: (o) => o.type.value, unsure: 'type' },
      isNewTask: { get: (o) => o.isNewTask >= 0.5, unsure: 'task' },
      needsReply: { get: (o) => o.needsReply.value, unsure: 'needsReply' },
      urgency: { get: (o) => o.urgency.value, unsure: 'urgency' },
      deadline: { get: (o) => o.deadline?.date?.slice(0, 10) ?? null, unsure: 'deadline' },
      tone: { get: (o) => o.tone.value, unsure: 'tone' },
      isChange: { get: (o) => o.isChange >= 0.5, unsure: 'change' },
      deadlineUnclear: { get: (o) => o.deadlineUnclear >= 0.5, unsure: 'ambiguity' },
      whatOrWhoUnclear: { get: (o) => o.whatOrWhoUnclear >= 0.5, unsure: 'ambiguity' },
      addressee: { get: (o) => o.addressee.value, unsure: 'addressee' }
    }
    // An invalid triage counts as a mismatch, so matches are out of all messages; unsure is out of valid ones.
    const fields = Object.fromEntries(
      Object.entries(FIELDS).map(([name, { get, unsure }]) => [
        name,
        {
          matches: `${runs.filter((r, i) => r.output && get(r.output) === labelled(messages[i])[name]).length}/${runs.length}`,
          unsure: `${valid.filter((r) => r.output.unsure.includes(unsure)).length}/${valid.length}`
        }
      ])
    )
    const wanted = (m, kind) =>
      kind === 'steps'
        ? m.isNewTask
        : kind === 'questions'
          ? m.deadlineUnclear || m.whatOrWhoUnclear
          : m.type === 'change'
    const actions = Object.fromEntries(
      ['steps', 'questions', 'transition'].map((kind) => {
        const offered = (r) => r.output?.actions.some((a) => a.kind === kind)
        return [
          kind,
          {
            offered: runs.filter(offered).length,
            primary: valid.filter((r) =>
              r.output.actions.some((a) => a.kind === kind && a.strength === 'primary')
            ).length,
            labelled: messages.filter((m) => wanted(m, kind)).length,
            both: runs.filter((r, i) => offered(r) && wanted(messages[i], kind)).length
          }
        ]
      })
    )
    const summary = {
      valid: `${valid.length}/${runs.length}`,
      invalid: invalidCount(runs),
      ...latency(runs)
    }

    dryNote()
    console.log(`Triage fields${tag}`)
    console.table(fields)
    console.log('Actions offered vs labelled')
    console.table(actions)
    console.table({ [`jev${tag}`]: summary })
    printFirstError('jev', runs)
    save([{ model: 'jev', runs, fields, actions, summary }])
  } else if (expandMode) {
    const KINDS = ['steps', 'questions', 'transition']
    const TOOL_KIND = {
      list_steps: 'steps',
      list_questions: 'questions',
      plan_transition: 'transition'
    }
    let claude
    if (dry) {
      // The first questions call returns garbage so the invalid path shows up.
      const fixtures = Object.fromEntries(
        KINDS.map((k) => [k, read(`src/shared/fixtures/demo.expansion.${k}.json`)])
      )
      let garbled = false
      claude = {
        async ask({ tool }) {
          const kind = TOOL_KIND[tool.name]
          if (!garbled && kind === 'questions') {
            garbled = true
            return { nope: 1 }
          }
          const answer = { ...fixtures[kind] }
          delete answer.kind
          return answer
        }
      }
    } else {
      const { createClaudeClient } = await server.ssrLoadModule('/src/main/ai/clients.ts')
      claude = createClaudeClient()
    }
    const { createExpander } = await server.ssrLoadModule('/src/main/ai/expand.ts')
    const expand = createExpander({ claude })

    const report = []
    for (const model of models) {
      process.env.PIP_MODEL = model // the client resolves it on every call
      for (const kind of KINDS) {
        const runs = []
        for (const m of messages)
          runs.push({ id: m.id, ...(await timed(() => expand(m.text, kind, 3, profile))) })
        const valid = runs.filter((r) => r.output)
        const count = (field) =>
          kind === (field === 'plan' ? 'transition' : field)
            ? average(valid.map((r) => r.output[field].length))
            : '-'
        report.push({
          model,
          kind,
          runs,
          summary: {
            valid: `${valid.length}/${runs.length}`,
            invalid: invalidCount(runs),
            ...latency(runs),
            avgSteps: count('steps'),
            avgQuestions: count('questions'),
            avgPlan: count('plan')
          }
        })
      }
    }
    dryNote()
    console.table(
      Object.fromEntries(
        report.map(({ model, kind, summary }) => [`${model} ${kind}${tag}`, summary])
      )
    )
    for (const { model, kind, runs } of report) printFirstError(`${model} ${kind}`, runs)
    save(report)
  } else {
    const { createDecoder } = await server.ssrLoadModule('/src/main/ai/decoder.ts')
    let claude, jev
    if (dry) {
      // Fake clients: the first call for one message returns garbage so the invalid path shows up.
      const demo = read('src/shared/fixtures/demo.decoded.json')
      let garbled = false
      claude = {
        async decode({ user }) {
          if (!garbled && user.includes('March sales')) {
            garbled = true
            return { nope: 1 }
          }
          const isChange = /moving|pasas|instead|pulled forward/i.test(user.split('<message>')[1])
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
      const decode = createDecoder({ claude, jev })
      const runs = []
      for (const m of messages)
        runs.push({
          id: m.id,
          isChange: m.isChange,
          vague: m.vague,
          ...(await timed(() => decode(m.text, 3, profile)))
        })
      const valid = runs.filter((r) => r.output)
      const vague = valid.filter((r) => r.vague)
      const matches = valid.filter((r) => (r.output.decode.change !== null) === r.isChange)
      report.push({
        model,
        runs,
        summary: {
          valid: `${valid.length}/${runs.length}`,
          invalid: invalidCount(runs),
          ...latency(runs),
          avgSteps: average(valid.map((r) => r.output.decode.steps.length)),
          // An invalid output counts as a mismatch, so the total is all messages.
          changeMatches: `${matches.length}/${runs.length}`,
          vagueUncertainties: `${vague.reduce((n, r) => n + r.output.decode.uncertainties.length, 0)} over ${vague.length} vague`
        }
      })
    }

    dryNote()
    console.table(Object.fromEntries(report.map(({ model, summary }) => [model + tag, summary])))
    for (const { model, runs } of report) printFirstError(model, runs)
    save(report)
  }
} finally {
  await server.close()
}
