import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'uuid';

const BASE_DIR = path.resolve('artifacts/deals');

async function ensureDir() {
  await fs.mkdir(BASE_DIR, { recursive: true });
}

export async function saveDealIngestion({ dealId, payload, sourceFiles, overwrite = false }) {
  await ensureDir();
  const id = dealId || randomUUID();
  const filePath = path.join(BASE_DIR, `${id}.json`);

  let current = { dealId: id, versions: [] };
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    current = JSON.parse(raw);
  } catch {
    // first write
  }

  if (current.versions.length > 0 && !overwrite) {
    return { blocked: true, dealId: id, message: 'Existing deal found. Set overwrite=true to write a new version.' };
  }

  const nextVersion = current.versions.length + 1;
  const record = {
    version: nextVersion,
    ingestedAt: new Date().toISOString(),
    sourceFiles: sourceFiles.map((f) => ({ name: f.originalname, size: f.size, mimetype: f.mimetype })),
    payload,
  };

  current.versions.push(record);
  await fs.writeFile(filePath, JSON.stringify(current, null, 2), 'utf8');
  return { blocked: false, dealId: id, version: nextVersion, payload };
}

export async function getLatestDealPayload(dealId) {
  const filePath = path.join(BASE_DIR, `${dealId}.json`);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const latest = parsed.versions?.[parsed.versions.length - 1];
  return latest || null;
}
