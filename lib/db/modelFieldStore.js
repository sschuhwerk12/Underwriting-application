import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_DIR = path.resolve('artifacts/model_fields');

async function ensureDir() {
  await fs.mkdir(BASE_DIR, { recursive: true });
}

function cleanDealId(dealId) {
  return String(dealId || 'active-ui-deal').trim() || 'active-ui-deal';
}

function getPath(dealId) {
  return path.join(BASE_DIR, `${cleanDealId(dealId)}.json`);
}

export async function saveModelFields({ dealId, modelFields, source = 'user' }) {
  await ensureDir();
  const filePath = getPath(dealId);
  const payload = {
    dealId: cleanDealId(dealId),
    as_of: new Date().toISOString(),
    source,
    modelFields: modelFields || {},
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export async function getModelFields(dealId) {
  const filePath = getPath(dealId);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function getModelFieldsOrNull(dealId) {
  try {
    return await getModelFields(dealId);
  } catch {
    return null;
  }
}

export async function applyModelFieldChanges({ dealId, changes = [], source = 'agent-apply' }) {
  const current = (await getModelFieldsOrNull(dealId)) || {
    dealId: cleanDealId(dealId),
    as_of: new Date().toISOString(),
    source,
    modelFields: {},
  };

  const next = structuredClone(current);
  next.as_of = new Date().toISOString();
  next.source = source;

  for (const change of changes) {
    if (!change?.field) continue;
    next.modelFields[change.field] = change.proposed_value;
  }

  await saveModelFields({ dealId: next.dealId, modelFields: next.modelFields, source });
  return next;
}
