import { getOpenAIClient, getModel } from '../lib/ai/openaiClient.js';
import { phase2SchemaDefault, validatePhase2Extraction } from '../lib/underwritingSchema/phase2Schema.js';

function systemPrompt() {
  return [
    'You are an extraction-only underwriting ingestion agent.',
    'No valuation logic, no recommendations.',
    'Return STRICT JSON only, matching required keys:',
    'property_profile, income, expenses, debt, assumptions, risks_detected, missing_data.',
    'If uncertain or absent, return null and include rationale in risks_detected.',
    'Do not hallucinate numbers.',
  ].join(' ');
}

function mergeExtractions(base, partial) {
  const merged = structuredClone(base);
  for (const group of ['property_profile', 'income', 'expenses', 'debt', 'assumptions']) {
    for (const [k, v] of Object.entries(partial[group] || {})) {
      if ((merged[group][k] == null || merged[group][k] === '') && v != null && v !== '') {
        merged[group][k] = v;
      }
    }
  }

  merged.risks_detected = [...new Set([...(base.risks_detected || []), ...(partial.risks_detected || [])])];
  merged.missing_data = [...new Set([...(base.missing_data || []), ...(partial.missing_data || [])])];
  return merged;
}

async function requestOnePass(client, batchText) {
  const response = await client.responses.create({
    model: getModel(),
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt() }] },
      { role: 'user', content: [{ type: 'input_text', text: batchText }] },
    ],
    text: { format: { type: 'json_object' } },
  });

  const raw = response.output_text || '{}';
  return JSON.parse(raw);
}

export async function extractUnderwritingFromBatches({ batches }) {
  const client = getOpenAIClient();

  if (!client) {
    return {
      ...phase2SchemaDefault,
      risks_detected: ['OPENAI_API_KEY not configured. Returned null extraction payload.'],
      missing_data: [
        'property_profile.property_name', 'property_profile.gross_sf', 'income.annual_gross_income',
        'expenses.opex_psf_year', 'debt.loan_amount', 'assumptions.hold_months', 'assumptions.exit_cap_rate',
      ],
    };
  }

  let aggregate = structuredClone(phase2SchemaDefault);

  for (const batch of batches) {
    const batchText = batch.chunks.map((c) => `[${c.sectionRef}]\n${c.text}`).join('\n\n');

    let parsed;
    try {
      parsed = await requestOnePass(client, batchText);
    } catch {
      // retry once on malformed/transport failures
      parsed = await requestOnePass(client, batchText);
    }

    const validated = validatePhase2Extraction(parsed);
    if (!validated.success) {
      // retry once with stricter instruction
      const retryText = `${batchText}\n\nIMPORTANT: Return valid JSON matching schema exactly.`;
      const retryParsed = await requestOnePass(client, retryText);
      const retryValidated = validatePhase2Extraction(retryParsed);
      if (!retryValidated.success) {
        const err = new Error(`Schema validation failed after retry: ${retryValidated.error.message}`);
        err.code = 'INGEST_SCHEMA_FAILED';
        err.statusCode = 502;
        throw err;
      }
      aggregate = mergeExtractions(aggregate, retryValidated.data);
      continue;
    }

    aggregate = mergeExtractions(aggregate, validated.data);
  }

  return aggregate;
}
