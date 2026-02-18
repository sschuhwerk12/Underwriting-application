import OpenAI from 'openai';

let openaiClient = null;
let openaiClientKey = null;

function createMissingKeyError(feature = 'ai') {
  const err = new Error(`OPENAI_API_KEY is required for ${feature}.`);
  err.code = 'OPENAI_API_KEY_MISSING';
  err.statusCode = 503;
  err.publicMessage = 'OpenAI API key is not configured. Set OPENAI_API_KEY in your environment.';
  return err;
}

function createIncompatibleSdkError() {
  const err = new Error('OpenAI SDK is incompatible: expected client.responses.create() support.');
  err.code = 'OPENAI_SDK_INCOMPATIBLE';
  err.statusCode = 500;
  err.publicMessage = 'OpenAI SDK is incompatible with this application. Install the pinned v5 SDK version from package.json (openai@5.0.0).';
  return err;
}

function assertResponsesApi(client) {
  if (!client?.responses || typeof client.responses.create !== 'function') {
    throw createIncompatibleSdkError();
  }
}

function buildClient(key) {
  const client = new OpenAI({ apiKey: key });
  assertResponsesApi(client);
  return client;
}

export function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  if (!openaiClient || openaiClientKey !== key) {
    openaiClient = buildClient(key);
    openaiClientKey = key;
  }
  return openaiClient;
}

export function getRequiredOpenAIClient(feature = 'ai') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw createMissingKeyError(feature);
  return getOpenAIClient();
}

export function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-5.2-codex';
}
