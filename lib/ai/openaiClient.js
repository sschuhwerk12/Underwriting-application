import OpenAI from 'openai';

let openaiClient = null;

export function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

export function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-5.2-codex';
}
