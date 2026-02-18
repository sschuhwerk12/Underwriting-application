/**
 * Phase 1 tool registry (stubs only).
 * TODO(Phase 2): Connect tools to ingestion, vector search, and underwriting engine.
 */
export const toolRegistry = {
  lookup_market_comp: async ({ market, subtype }) => ({
    tool: 'lookup_market_comp',
    ok: true,
    data: { market, subtype, note: 'Stub tool response (Phase 1).' },
  }),
  fetch_property_document_context: async ({ propertyId }) => ({
    tool: 'fetch_property_document_context',
    ok: true,
    data: { propertyId, chunks: [], note: 'No document parsing in Phase 1.' },
  }),
};

export async function runToolCall(name, args = {}) {
  const fn = toolRegistry[name];
  if (!fn) {
    return { tool: name, ok: false, error: `Unknown tool: ${name}` };
  }
  return fn(args);
}
