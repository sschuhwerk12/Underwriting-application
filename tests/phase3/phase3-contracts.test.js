import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  advisorResponseSchema,
  applyChangesRequestSchema,
} from '../../lib/underwritingSchema/phase3Schemas.js';
import { upsertModelFields } from '../../ai/phase3/tools.js';
import { generateAdvisorResponse } from '../../ai/phase3/advisorAgent.js';
import { createAuditReport } from '../../ai/phase3/auditAgent.js';

async function loadFixture() {
  const raw = await fs.readFile(new URL('../fixtures/sample_deal_phase3.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('advisor agent returns contract-compliant payload', async () => {
  const fixture = await loadFixture();
  await upsertModelFields(fixture.deal_id, fixture.model_fields, 'test');

  const result = await generateAdvisorResponse({
    dealId: fixture.deal_id,
    prompt: 'Recommend underwriting improvements and risks.',
    mode: 'recommendation',
    history: [],
  });

  const parsed = advisorResponseSchema.safeParse(result.advisor);
  assert.equal(parsed.success, true);
  assert.equal(result.advisor.deal_snapshot.deal_id, fixture.deal_id);
});

test('audit agent returns required sections', async () => {
  const fixture = await loadFixture();
  await upsertModelFields(fixture.deal_id, fixture.model_fields, 'test');

  const audit = await createAuditReport({ dealId: fixture.deal_id });
  assert.equal(typeof audit.deal_id, 'string');
  assert.ok(Array.isArray(audit.errors));
  assert.ok(Array.isArray(audit.warnings));
  assert.ok(Array.isArray(audit.questions));
  assert.ok(Array.isArray(audit.improvement_suggestions));
});

test('apply-changes request requires explicit confirmation', () => {
  const invalid = applyChangesRequestSchema.safeParse({
    deal_id: 'x',
    confirmationToken: 'token12345',
    confirm: false,
  });
  assert.equal(invalid.success, false);

  const valid = applyChangesRequestSchema.safeParse({
    deal_id: 'x',
    confirmationToken: 'token12345',
    confirm: true,
  });
  assert.equal(valid.success, true);
});
