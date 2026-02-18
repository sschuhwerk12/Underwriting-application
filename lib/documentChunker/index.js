/**
 * Phase 2 chunking strategy:
 * - section-aware slicing first
 * - token-estimated chunk size controls
 * - batches created to avoid token overflow
 */

export function estimateTokens(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.35);
}

export function chunkBySections(sections, maxTokensPerChunk = 1800) {
  const chunks = [];

  for (const section of sections) {
    const content = String(section.text || '').trim();
    if (!content) continue;

    const lines = content.split(/\n+/).filter(Boolean);
    let buffer = [];
    let tokenCount = 0;

    for (const line of lines) {
      const lineTokens = estimateTokens(line);
      if (tokenCount + lineTokens > maxTokensPerChunk && buffer.length) {
        chunks.push({
          chunkId: `${section.sectionRef}::${chunks.length + 1}`,
          sectionRef: section.sectionRef,
          text: buffer.join('\n'),
          estimatedTokens: tokenCount,
        });
        buffer = [];
        tokenCount = 0;
      }
      buffer.push(line);
      tokenCount += lineTokens;
    }

    if (buffer.length) {
      chunks.push({
        chunkId: `${section.sectionRef}::${chunks.length + 1}`,
        sectionRef: section.sectionRef,
        text: buffer.join('\n'),
        estimatedTokens: tokenCount,
      });
    }
  }

  return chunks;
}

export function batchChunks(chunks, maxTokensPerBatch = 7000, maxChunksPerBatch = 8) {
  const batches = [];
  let current = [];
  let tokens = 0;

  for (const chunk of chunks) {
    const cTokens = chunk.estimatedTokens || estimateTokens(chunk.text);
    const exceeds = (tokens + cTokens > maxTokensPerBatch) || (current.length >= maxChunksPerBatch);

    if (exceeds && current.length) {
      batches.push({ chunks: current, estimatedTokens: tokens });
      current = [];
      tokens = 0;
    }

    current.push(chunk);
    tokens += cTokens;
  }

  if (current.length) batches.push({ chunks: current, estimatedTokens: tokens });
  return batches;
}
