/**
 * Phase 1 performance scaffolding.
 * TODO(Phase 2): Replace with tokenizer-aware chunking tied to ingestion outputs.
 */
export function chunkTextPlaceholder(text, chunkSize = 1200) {
  const input = String(text || '');
  if (!input) return [];
  const chunks = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * TODO(Phase 2): Wire embeddings provider and persistent vector index.
 */
export async function embedTextPlaceholder(_text) {
  return { vector: [], provider: 'unconfigured', phase: 1 };
}
