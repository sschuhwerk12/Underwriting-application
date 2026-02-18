import { randomUUID } from 'node:crypto';

import { getLatestDealPayload } from '../../lib/db/dealStore.js';
import { applyModelFieldChanges, getModelFieldsOrNull, saveModelFields } from '../../lib/db/modelFieldStore.js';
import { createAuditReport } from './auditAgent.js';
import { createScenarioSet } from './scenarioAgent.js';
import { putPendingChangeSet } from './memoryStore.js';

function normalizeDealId(dealId) {
  return String(dealId || 'active-ui-deal').trim() || 'active-ui-deal';
}

function createDealSummary({ dealId, ingested, model }) {
  const modelFields = model?.modelFields || {};
  const payload = ingested?.payload || {};

  return {
    deal_id: dealId,
    as_of: model?.as_of || ingested?.ingestedAt || new Date().toISOString(),
    source: {
      ingested: Boolean(ingested),
      model_fields: Boolean(model),
    },
    deal_summary: {
      purchase_price: modelFields.purchasePrice ?? payload?.debt?.loan_amount ?? null,
      gross_sf: modelFields.grossSf ?? payload?.property_profile?.gross_sf ?? null,
      hold_months: modelFields.holdMonths ?? payload?.assumptions?.hold_months ?? null,
      exit_cap_rate: modelFields.exitCapRate ?? payload?.assumptions?.exit_cap_rate ?? null,
      sale_cost_pct: modelFields.saleCostPct ?? payload?.assumptions?.sale_cost_pct ?? null,
      growth_by_year: modelFields.growthByYear ?? null,
      inflation_by_year: modelFields.inflationByYear ?? null,
    },
  };
}

export async function fetchDeal(dealId) {
  const id = normalizeDealId(dealId);
  let ingested = null;
  try {
    ingested = await getLatestDealPayload(id);
  } catch {
    ingested = null;
  }

  const model = await getModelFieldsOrNull(id);
  return createDealSummary({ dealId: id, ingested, model });
}

export async function fetchModelFields(dealId) {
  const id = normalizeDealId(dealId);
  const model = await getModelFieldsOrNull(id);
  if (model) return model;

  return {
    dealId: id,
    as_of: new Date().toISOString(),
    source: 'empty',
    modelFields: {},
  };
}

export async function upsertModelFields(dealId, modelFields, source = 'user') {
  const id = normalizeDealId(dealId);
  return saveModelFields({ dealId: id, modelFields, source });
}

export async function proposeChanges(dealId, changes = []) {
  const id = normalizeDealId(dealId);
  const token = randomUUID();
  const pending = await putPendingChangeSet({ token, dealId: id, changes });
  return {
    deal_id: id,
    confirmationToken: pending.token,
    expires_at: pending.expiresAt,
    proposed_changes_count: changes.length,
  };
}

export async function applyChanges(dealId, changes = []) {
  const id = normalizeDealId(dealId);
  return applyModelFieldChanges({ dealId: id, changes, source: 'agent-apply' });
}

export async function runAudit(dealId, scenarioDeltas = []) {
  const id = normalizeDealId(dealId);
  return createAuditReport({ dealId: id, scenarioDeltas });
}

export async function createScenarioSetTool(dealId) {
  const id = normalizeDealId(dealId);
  return createScenarioSet({ dealId: id });
}
