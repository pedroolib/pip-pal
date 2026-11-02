// The real SDK clients. Keys come only from process.env (each SDK reads its own variable), in main only.
// Logging is off in both: their debug levels would print request bodies.
import Anthropic from '@anthropic-ai/sdk'
import { APIError, TypeSafeClient, type Questions } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { JEV_TIMEOUT_MS, ToolOutput, type ClaudeClient, type JevClient } from './decoder'
import { JEV_QUESTIONS, toClassification } from './jev-questions'
import { resolveModel } from './models'
import type { TriageJevClient } from './triage'

const TOOL_NAME = 'decode_message'

/** Reads ANTHROPIC_API_KEY. The model is resolved per call, so a bad PIP_MODEL fails the decode, not startup. */
export function createClaudeClient(
  // maxRetries 0: the decoder owns the retry. openTelemetry false: no message content in spans.
  client: Pick<Anthropic, 'messages'> = new Anthropic({
    timeout: 30_000,
    maxRetries: 0,
    openTelemetry: false,
    logLevel: 'off'
  })
): ClaudeClient {
  const schema = z.toJSONSchema(ToolOutput)
  delete schema.$schema
  const tool = {
    name: TOOL_NAME,
    description: 'Return the decoded message and its classification.',
    input_schema: schema as Anthropic.Tool.InputSchema
  }
  return {
    async decode({ system, user }) {
      try {
        const res = await client.messages.create({
          model: resolveModel(),
          max_tokens: 8192,
          system: `${system}\n\nAnswer only by calling the ${TOOL_NAME} tool. Do not write any other text.`,
          messages: [{ role: 'user', content: user }],
          tools: [tool],
          // Sonnet 5.5 rejects a forced tool_choice (type "tool" or "any") with a 400; auto plus the rule above replaces it.
          tool_choice: { type: 'auto' },
          // Docs: effort sets thinking depth and token spend; low suits latency-sensitive routes.
          output_config: { effort: 'low' }
        })
        // A missing or truncated tool call fails validation in the decoder, which retries once.
        return res.content.find((b) => b.type === 'tool_use')?.input
      } catch (e) {
        // Status and the API's own message only, never the request (it holds the user's text).
        if (e instanceof Anthropic.APIError) {
          const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message
          throw new Error(`Claude API error ${e.status}: ${detail ?? 'no message'}`, { cause: e })
        }
        throw e
      }
    }
  }
}

/** Reads TYPESAFE_API_KEY. Failures and timeouts reject; the decoder then uses Claude's classification. */
export function createJevClient(): JevClient {
  const client = new TypeSafeClient({
    timeout: JEV_TIMEOUT_MS,
    retry: { maxRetries: 0 },
    logLevel: 'off'
  })
  return {
    async classify(text) {
      const { answers } = await client.systemOne({
        state: { message: text },
        questions: JEV_QUESTIONS
      })
      return toClassification(answers)
    }
  }
}

// ---------- Jev for triage (one bundled request per message) ----------

/** Reads TYPESAFE_API_KEY. Errors keep only the HTTP status: an API error body may quote the request. */
export function createTriageJevClient(
  client: Pick<TypeSafeClient, 'systemOne'> = new TypeSafeClient({
    timeout: JEV_TIMEOUT_MS,
    retry: { maxRetries: 0 },
    logLevel: 'off'
  })
): TriageJevClient {
  return {
    async ask({ state, questions }) {
      const { answers } = await client
        .systemOne({ state, questions: questions as Questions })
        .catch((e: unknown) => {
          // No cause on purpose: the caught error's body or message may quote the request.
          const status = e instanceof APIError ? e.status : null
          throw new Error(status ? `Jev API error ${status}` : 'Jev request failed.')
        })
      return answers
    }
  }
}
