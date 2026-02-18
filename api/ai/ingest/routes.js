import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';

import { validateUploadedFile, extractDocumentSections } from '../../../lib/ingestion/extractors.js';
import { chunkBySections, batchChunks } from '../../../lib/documentChunker/index.js';
import { extractUnderwritingFromBatches } from '../../../ai/ingestionAgent.js';
import { saveDealIngestion } from '../../../lib/db/dealStore.js';

const TMP_DIR = path.resolve('artifacts/tmp_uploads');
await fs.mkdir(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: Number(process.env.INGEST_MAX_FILE_BYTES || 15 * 1024 * 1024),
    files: Number(process.env.INGEST_MAX_FILES || 10),
  },
});

export const ingestRouter = Router();

ingestRouter.post('/', upload.array('files'), async (req, res, next) => {
  const cleanupPaths = [];
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No files uploaded.', code: 'NO_FILES' });
    }

    const bad = files
      .map((f) => ({ f, validation: validateUploadedFile(f) }))
      .filter((x) => !x.validation.ok);
    if (bad.length) {
      return res.status(400).json({
        error: 'One or more files failed validation.',
        code: 'INVALID_UPLOAD',
        details: bad.map((b) => ({ file: b.f.originalname, reason: b.validation.reason })),
      });
    }

    const sectionDocuments = [];
    for (const file of files) {
      cleanupPaths.push(file.path);
      const sections = await extractDocumentSections(file);
      sectionDocuments.push(...sections);
    }

    const chunks = chunkBySections(sectionDocuments, Number(process.env.INGEST_MAX_TOKENS_PER_CHUNK || 1800));
    const batches = batchChunks(chunks, Number(process.env.INGEST_MAX_TOKENS_PER_BATCH || 7000), Number(process.env.INGEST_MAX_CHUNKS_PER_BATCH || 8));

    const extracted = await extractUnderwritingFromBatches({ batches });

    const dealId = String(req.body.dealId || '').trim() || undefined;
    const overwrite = String(req.body.overwrite || 'false').toLowerCase() === 'true';

    const saved = await saveDealIngestion({ dealId, payload: extracted, sourceFiles: files, overwrite });
    if (saved.blocked) {
      return res.status(409).json({
        error: saved.message,
        code: 'OVERWRITE_REQUIRED',
        dealId: saved.dealId,
      });
    }

    return res.status(200).json({
      ok: true,
      status: 'ingested',
      dealId: saved.dealId,
      version: saved.version,
      ingestion: {
        filesProcessed: files.length,
        sectionCount: sectionDocuments.length,
        chunkCount: chunks.length,
        batchCount: batches.length,
      },
      payload: extracted,
      missing_data: extracted.missing_data || [],
      risks_detected: extracted.risks_detected || [],
    });
  } catch (err) {
    return next(err);
  } finally {
    await Promise.all(cleanupPaths.map((p) => fs.unlink(p).catch(() => null)));
  }
});
