import { auditResponseSchema } from '../../lib/underwritingSchema/phase3Schemas.js';
import { buildPhase3Context } from './context.js';

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function appendQuestion(questions, condition, question, neededFor) {
  if (condition) questions.push({ question, needed_for: neededFor });
}

export async function createAuditReport({ dealId, scenarioDeltas = [] }) {
  const context = await buildPhase3Context({ dealId });
  const model = structuredClone(context.model?.modelFields || {});

  for (const delta of scenarioDeltas) {
    if (!delta?.field) continue;
    const current = model[delta.field];
    if (typeof delta.delta === 'number' && typeof current === 'number') model[delta.field] = current + delta.delta;
    else model[delta.field] = delta.delta;
  }

  const errors = [];
  const warnings = [];
  const questions = [];
  const improvementSuggestions = [];

  const holdMonths = numeric(model.holdMonths);
  const grossSf = numeric(model.grossSf);
  const purchasePrice = numeric(model.purchasePrice);
  const exitCapRate = numeric(model.exitCapRate);
  const saleCostPct = numeric(model.saleCostPct);
  const ltv = numeric(model.initialLtv ?? model['debt.initialLtv']);

  if (holdMonths != null && holdMonths < 1) {
    errors.push({
      field: 'holdMonths',
      issue: 'Hold period must be at least 1 month.',
      why_it_matters: 'A zero or negative hold period breaks sale-date and IRR calculations.',
      fix: 'Set holdMonths to a positive integer, typically 12-120.',
    });
  }

  if (grossSf != null && grossSf <= 0) {
    errors.push({
      field: 'grossSf',
      issue: 'Gross SF must be greater than 0.',
      why_it_matters: 'Per-SF rent/expense metrics divide by gross SF.',
      fix: 'Enter accurate building gross square footage.',
    });
  }

  if (purchasePrice != null && purchasePrice <= 0) {
    errors.push({
      field: 'purchasePrice',
      issue: 'Purchase price must be greater than 0.',
      why_it_matters: 'Negative or zero basis invalidates return metrics.',
      fix: 'Enter a positive acquisition price.',
    });
  }

  if (exitCapRate != null && (exitCapRate <= 0 || exitCapRate >= 0.2)) {
    warnings.push({
      field: 'exitCapRate',
      issue: 'Exit cap appears outside typical institutional range.',
      range_or_rule: 'Expected rough range: 3% to 12% depending on property/market.',
      suggestion: 'Confirm using market comps or lender/investor guidance.',
    });
  }

  if (saleCostPct != null && (saleCostPct < 0 || saleCostPct > 0.1)) {
    warnings.push({
      field: 'saleCostPct',
      issue: 'Sale costs as % of gross sale look unusual.',
      range_or_rule: 'Common rough range: 1% to 6%.',
      suggestion: 'Break out broker/legal/transfer taxes and recalibrate.',
    });
  }

  if (ltv != null && (ltv <= 0 || ltv > 0.85)) {
    warnings.push({
      field: 'initialLtv',
      issue: 'Debt sizing may be aggressive or invalid.',
      range_or_rule: 'Institutional bridge/perm debt often ~50%-75% LTV.',
      suggestion: 'Check lender proceeds, DSCR constraints, and refinance risk.',
    });
  }

  appendQuestion(questions, holdMonths == null, 'What hold period (months) should be underwritten?', 'Exit timing and terminal value');
  appendQuestion(questions, exitCapRate == null, 'What exit cap rate should be used for terminal valuation?', 'Sale value and downside risk');
  appendQuestion(questions, purchasePrice == null, 'What is the acquisition price/basis?', 'Equity requirement and returns');

  improvementSuggestions.push({
    title: 'Add explicit downside assumptions',
    details: 'Define downside deltas for exit cap, rent growth, and inflation to stress test DSCR and equity returns.',
  });
  improvementSuggestions.push({
    title: 'Document market evidence inputs',
    details: 'Store cap-rate comps and lender quotes as user-supplied inputs to avoid unsupported market assumptions.',
  });

  const result = {
    deal_id: context.deal.deal_id,
    as_of: new Date().toISOString(),
    errors,
    warnings,
    questions,
    improvement_suggestions: improvementSuggestions,
  };

  return auditResponseSchema.parse(result);
}
