import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse as csvParse } from 'csv-parse/sync';
import xlsx from 'xlsx';

const require = createRequire(import.meta.url);
const XLSX = xlsx;
const ALLOWED_EXT = new Set(['.pdf', '.csv', '.xlsx', '.xls']);

let pdfParseCore = null;

function getPdfParseCore() {
  if (pdfParseCore) return pdfParseCore;

  // Important: avoid importing package root ('pdf-parse') at module load time.
  // In some environments that path executes package-level startup logic that references
  // test fixture files and throws ENOENT before the app even starts.
  // Using the core parser entrypoint prevents test-fixture loading side effects.
  const parser = require('pdf-parse/lib/pdf-parse.js');
  pdfParseCore = parser?.default || parser;
  return pdfParseCore;
}

export function validateUploadedFile(file, maxBytes = Number(process.env.INGEST_MAX_FILE_BYTES || 15 * 1024 * 1024)) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, reason: `Unsupported file extension: ${ext}` };
  }
  if (file.size > maxBytes) {
    return { ok: false, reason: `File exceeds max size (${maxBytes} bytes)` };
  }
  return { ok: true, ext };
}

export async function extractPdfSections(filePath, fileName) {
  const raw = await fs.readFile(filePath);
  const parsePdf = getPdfParseCore();
  const parsed = await parsePdf(raw);
  const text = String(parsed.text || '').trim();
  return [{ sectionRef: `${fileName}::pdf`, text }];
}

export async function extractCsvSections(filePath, fileName) {
  const raw = await fs.readFile(filePath, 'utf8');
  const records = csvParse(raw, { columns: true, skip_empty_lines: true });
  const headers = records.length ? Object.keys(records[0]) : [];
  const rows = records.slice(0, 500).map((r, i) => `Row ${i + 1}: ${headers.map((h) => `${h}=${r[h] ?? ''}`).join(' | ')}`);
  return [{ sectionRef: `${fileName}::csv`, text: [`Headers: ${headers.join(', ')}`, ...rows].join('\n') }];
}

export async function extractExcelSections(filePath, fileName) {
  const raw = await fs.readFile(filePath);
  const wb = XLSX.read(raw, { type: 'buffer', cellDates: false });
  const sections = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const lines = rows.slice(0, 500).map((row, i) => `Row ${i + 1}: ${row.join(' | ')}`);
    sections.push({ sectionRef: `${fileName}::sheet:${sheetName}`, text: lines.join('\n') });
  }

  return sections;
}

export async function extractDocumentSections(file) {
  const filePath = file.path;
  const fileName = path.basename(file.originalname);
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.pdf') return extractPdfSections(filePath, fileName);
  if (ext === '.csv') return extractCsvSections(filePath, fileName);
  if (ext === '.xlsx' || ext === '.xls') return extractExcelSections(filePath, fileName);

  return [{ sectionRef: `${fileName}::unknown`, text: '' }];
}
