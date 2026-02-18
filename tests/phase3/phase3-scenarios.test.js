import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { scenarioResponseSchema } from '../../lib/underwritingSchema/phase3Schemas.js';
import { upsertModelFields } from '../../ai/phase3/tools.js';
import { createScenarioSet } from '../../ai/phase3/scenarioAgent.js';

async function loadFixture() {
  const raw = await fs.readFile(new URL('../fixtures/sample_deal_phase3.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('scenario generator returns delta-only structure and at least 3 sensitivities', async () => {
  const fixture = await loadFixture();
  await upsertModelFields(fixture.deal_id, fixture.model_fields, 'test');

  const scenarios = await createScenarioSet({ dealId: fixture.deal_id });
  const parsed = scenarioResponseSchema.safeParse(scenarios);
  assert.equal(parsed.success, true);
  assert.equal(scenarios.apply_requires_confirmation, true);
  assert.ok(scenarios.sensitivities.length >= 3);
});
