// The real SDK clients. Keys come only from process.env (each SDK reads its own variable), in main only.
// Logging is off in both: their debug levels would print request bodies.
import Anthropic from '@anthropic-ai/sdk'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { JEV_TIMEOUT_MS, ToolOutput, type ClaudeClient, type JevClient } from './decoder'
import { JEV_QUESTIONS, toClassification } from './jev-questions'
import { resolveModel } from './models'

const TOOL_NAME = 'decode_message'

/** Reads ANTHROPIC_API_KEY. The model is resolved per call, so a bad PIP_MODEL fails the decode, not startup. */
export function createClaudeClient(): ClaudeClient {
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1, logLevel: 'off' })
  const schema = z.toJSONSchema(ToolOutput)
  delete schema.$schema
  const tool = {
    name: TOOL_NAME,
    description: 'Return the decoded message and its classification.',
    input_schema: schema as Anthropic.Tool.InputSchema
  }
  return {
    async decode({ system, user }) {
      const res = await client.messages.create({
        model: resolveModel(),
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [tool],
        tool_choice: { type: 'tool', name: TOOL_NAME }
      })
      // A missing or truncated tool call fails validation in the decoder, which retries once.
      return res.content.find((b) => b.type === 'tool_use')?.input
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
