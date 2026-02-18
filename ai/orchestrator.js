import { getRequiredOpenAIClient, getModel } from '../lib/ai/openaiClient.js';
import { runToolCall } from './tools.js';
import { coerceToUnderwritingPayload, validateUnderwritingPayload } from '../lib/underwritingSchema/validate.js';
import { underwritingSchema } from '../lib/underwritingSchema/schema.js';

function buildSystemPrompt() {
  return [
    'You are the Phase 1 Underwriting Assistant Infrastructure.',
    'Do not perform underwriting intelligence.',
    'Return strict JSON only with keys: property_profile, income, expenses, debt, assumptions.',
  ].join(' ');
}

export async function generateStructuredResponse({ message, history = [], toolCalls = [] }) {
  const toolOutputs = [];
  for (const call of toolCalls) {
    if (!call?.name) continue;
    // Tool-calling framework exists, but tools are stubs in Phase 1.
    toolOutputs.push(await runToolCall(call.name, call.args || {}));
  }

  let client = null;
  try {
    client = getRequiredOpenAIClient('phase1-orchestrator');
  } catch {
    const fallback = coerceToUnderwritingPayload({
      assumptions: { echo: message, tool_outputs: toolOutputs },
    });
    return { payload: fallback, toolOutputs, source: 'fallback' };
  }

  const response = await client.responses.create({
    model: getModel(),
    input: [
      { role: 'system', content: [{ type: 'input_text', text: buildSystemPrompt() }] },
      ...history.map((m) => ({ role: m.role, content: [{ type: 'input_text', text: m.content }] })),
      { role: 'user', content: [{ type: 'input_text', text: message }] },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'underwriting_payload',
        strict: true,
        schema: underwritingSchema,
      },
    },
  });

  const raw = response.output_text || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error('Model returned non-JSON payload.');
    err.code = 'INVALID_AI_JSON';
    err.statusCode = 502;
    throw err;
  }

  const normalized = coerceToUnderwritingPayload(parsed);
  const validation = validateUnderwritingPayload(normalized);
  if (!validation.ok) {
    const err = new Error(`Schema validation failed: ${validation.errors.join('; ')}`);
    err.code = 'SCHEMA_VALIDATION_FAILED';
    err.statusCode = 502;
    throw err;
  }

  return { payload: normalized, toolOutputs, source: 'openai' };
}

export async function* streamAssistantResponse({ message, history = [] }) {
  let client = null;
  try {
    client = getRequiredOpenAIClient('phase1-stream');
  } catch {
    const fallback = `Phase 1 echo: ${message}`;
    for (const token of fallback.split(' ')) {
      yield `${token} `;
    }
    return;
  }

  const stream = await client.responses.stream({
    model: getModel(),
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'Phase 1 chat shell. Keep response concise.' }] },
      ...history.map((m) => ({ role: m.role, content: [{ type: 'input_text', text: m.content }] })),
      { role: 'user', content: [{ type: 'input_text', text: message }] },
    ],
  });

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      yield event.delta;
    }
  }
}
