import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_PATH = path.resolve('artifacts/ai_memory.json');

async function readMemory() {
  try {
    const raw = await fs.readFile(MEMORY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { deals: {}, pendingChangeSets: {} };
  }
}

async function writeMemory(data) {
  await fs.mkdir(path.dirname(MEMORY_PATH), { recursive: true });
  await fs.writeFile(MEMORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function appendDealMemory({ dealId, role, content, summary }) {
  const db = await readMemory();
  const id = String(dealId || 'active-ui-deal');
  db.deals[id] = db.deals[id] || { conversation: [], summaries: [] };
  if (content) db.deals[id].conversation.push({ ts: new Date().toISOString(), role, content });
  if (summary) db.deals[id].summaries.push({ ts: new Date().toISOString(), text: summary });
  db.deals[id].conversation = db.deals[id].conversation.slice(-20);
  db.deals[id].summaries = db.deals[id].summaries.slice(-10);
  await writeMemory(db);
}

export async function getDealMemory(dealId) {
  const db = await readMemory();
  return db.deals[String(dealId || 'active-ui-deal')] || { conversation: [], summaries: [] };
}

export async function putPendingChangeSet({ token, dealId, changes }) {
  const db = await readMemory();
  db.pendingChangeSets[token] = {
    token,
    dealId: String(dealId || 'active-ui-deal'),
    changes,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
  await writeMemory(db);
  return db.pendingChangeSets[token];
}

export async function consumePendingChangeSet(token) {
  const db = await readMemory();
  const row = db.pendingChangeSets[token];
  if (!row) return null;
  delete db.pendingChangeSets[token];
  await writeMemory(db);
  return row;
}
