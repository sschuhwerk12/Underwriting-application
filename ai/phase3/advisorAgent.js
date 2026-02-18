import { getRequiredOpenAIClient, getModel } from '../../lib/ai/openaiClient.js';
import { advisorResponseSchema } from '../../lib/underwritingSchema/phase3Schemas.js';
import { buildAssumptionsUsed, buildPhase3Context } from './context.js';
import { appendDealMemory } from './memoryStore.js';
import { createAuditReport } from './auditAgent.js';
import { createScenarioSet } from './scenarioAgent.js';
import { fetchDeal, fetchModelFields, proposeChanges } from './tools.js';

function detectMode(prompt, explicitMode) {
  if (explicitMode && explicitMode !== 'chat') return explicitMode;
  const p = String(prompt || '').toLowerCase();
  if (p.includes('scenario')) return 'scenario';
  if (p.includes('recommend') || p.includes('suggest')) return 'recommendation';
  return 'chat';
}

function detectMarketDataRequest(prompt) {
  const p = String(prompt || '').toLowerCase();
  return p.includes('market cap rate') || p.includes('market rate') || p.includes('comps') || p.includes('lender quote');
}

function localAdvisorFallback({ mode, context, prompt }) {
  const model = context.model?.modelFields || {};
  const summary = [];
  const unknowns = [];
  const risks = [];
  const actions = [];
  const changes = [];

  if (detectMarketDataRequest(prompt)) {
    unknowns.push('External market inputs are not provided (cap rate comps, lender quotes, transaction evidence).');
    actions.push({
      title: 'Provide market inputs',
      why: 'The advisor cannot fabricate market cap rates, comps, or financing terms.',
      impact: 'high',
    });
  }

  const hold = model.holdMonths;
  const cap = model.exitCapRate;
  const growth0 = Array.isArray(model.growthByYear) ? model.growthByYear[0] : null;
  const infl0 = Array.isArray(model.inflationByYear) ? model.inflationByYear[0] : null;

  summary.push('The analysis uses your current deal snapshot and user-entered assumptions only.');
  if (cap == null) unknowns.push('Missing exitCapRate prevents complete terminal value reasoning.');
  if (hold == null) unknowns.push('Missing holdMonths prevents timing-sensitive valuation discussion.');

  if (typeof cap === 'number' && cap < 0.045) {
    risks.push('Exit cap is tight; valuation could be overstated if market softens.');
    changes.push({
      field: 'exitCapRate',
      current_value: cap,
      proposed_value: cap + 0.0025,
      rationale: 'Conservative downside stress to reflect reversion risk.',
      confidence: 'medium',
    });
  }
  if (typeof growth0 === 'number' && typeof infl0 === 'number' && growth0 < infl0) {
    risks.push('Year-1 rent growth is below inflation, which may compress NOI margins.');
    actions.push({
      title: 'Revisit expense growth controls',
      why: 'Expense inflation outpacing rent growth may pressure DSCR and returns.',
      impact: 'medium',
    });
  }

  if (!actions.length) {
    actions.push({
      title: 'Run downside scenario set',
      why: 'Stress terminal cap, rent growth, and debt sizing to quantify downside resilience.',
      impact: 'high',
    });
  }

  return advisorResponseSchema.parse({
    mode,
    deal_snapshot: {
      deal_id: context.deal.deal_id,
      as_of: new Date().toISOString(),
    },
    summary,
    analysis: {
      income_logic: ['Income outlook follows current growth inputs and tenant rollover assumptions already in the model.'],
      expense_logic: ['Expense pressure is assessed against inflation inputs; downside inflation should be tested.'],
      cap_rate_logic: ['Terminal valuation is highly sensitive to exit cap assumptions and must be evidence-backed.'],
      discount_rate_logic: ['Discount-rate recommendation requires investor hurdle/market evidence not present in model state.'],
      debt_logic: ['Debt sizing effects are inferred from LTV and rate settings currently entered by user.'],
      exit_logic: ['Exit proceeds depend on terminal NOI, exit cap, and sale costs; unknowns are flagged when inputs are absent.'],
      sensitivity_logic: ['Recommended sensitivities: exit cap, rent growth, expense inflation, and leverage.'],
    },
    assumptions_used: buildAssumptionsUsed(model, context.deal.deal_summary),
    unknowns,
    risks,
    recommended_actions: actions,
    proposed_model_changes: changes,
  });
}

function advisorPrompt() {
  return [
    'You are the Phase III Underwriting Advisor Agent.',
    'Hard rules: never fabricate market data, comps, cap rates, or financing terms.',
    'If market evidence is missing, state: "I need your market inputs (cap rate comps, lender quotes, etc.)."',
    'Separate known deal data from inference.',
    'Use conservative suggestions under uncertainty and label as suggestions.',
    'Return strict JSON only per schema.',
  ].join(' ');
}

async function runWithTools(client, prompt, mode, context) {
  const tools = [
    {
      type: 'function',
      name: 'fetchDeal',
      description: 'Fetches normalized deal summary for a deal_id.',
      parameters: {
        type: 'object',
        properties: { deal_id: { type: 'string' } },
      },
    },
    {
      type: 'function',
      name: 'fetchModelFields',
      description: 'Fetches current model field values for deal_id.',
      parameters: {
        type: 'object',
        properties: { deal_id: { type: 'string' } },
      },
    },
    {
      type: 'function',
      name: 'runAudit',
      description: 'Runs validation/error check agent for deal_id.',
      parameters: {
        type: 'object',
        properties: { deal_id: { type: 'string' } },
      },
    },
    {
      type: 'function',
      name: 'createScenarioSet',
      description: 'Creates base/upside/downside scenario deltas for deal_id.',
      parameters: {
        type: 'object',
        properties: { deal_id: { type: 'string' } },
      },
    },
  ];

  let response = await client.responses.create({
    model: getModel(),
    input: [
      { role: 'system', content: [{ type: 'input_text', text: advisorPrompt() }] },
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify({ mode, prompt, context }, null, 2) }],
      },
    ],
    tools,
    text: { format: { type: 'json_object' } },
  });

  for (let i = 0; i < 4; i++) {
    const calls = response.output?.filter((x) => x.type === 'function_call') || [];
    if (!calls.length) break;

    const outputs = [];
    for (const call of calls) {
      const args = JSON.parse(call.arguments || '{}');
      const dealId = args.deal_id || context.deal.deal_id;
      let result = { error: 'Unknown tool' };
      if (call.name === 'fetchDeal') result = await fetchDeal(dealId);
      if (call.name === 'fetchModelFields') result = await fetchModelFields(dealId);
      if (call.name === 'runAudit') result = await createAuditReport({ dealId });
      if (call.name === 'createScenarioSet') result = await createScenarioSet({ dealId });
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
    }

    response = await client.responses.create({
      model: getModel(),
      previous_response_id: response.id,
      input: outputs,
      text: { format: { type: 'json_object' } },
    });
  }

  return JSON.parse(response.output_text || '{}');
}

export async function generateAdvisorResponse({ dealId, prompt, mode = 'chat', history = [] }) {
  const context = await buildPhase3Context({ dealId });
  const resolvedMode = detectMode(prompt, mode);

  let advisor;
  try {
    const client = getRequiredOpenAIClient('phase3-advisor');
    const raw = await runWithTools(client, prompt, resolvedMode, {
      deal: context.deal,
      model: context.model,
      memory: context.memory,
      history: history.slice(-8),
    });
    advisor = advisorResponseSchema.parse(raw);
  } catch {
    advisor = localAdvisorFallback({ mode: resolvedMode, context, prompt });
  }

  let changeProposal = null;
  if (advisor.proposed_model_changes.length) {
    changeProposal = await proposeChanges(context.deal.deal_id, advisor.proposed_model_changes);
  }

  await appendDealMemory({ dealId: context.deal.deal_id, role: 'user', content: prompt });
  await appendDealMemory({ dealId: context.deal.deal_id, role: 'assistant', content: JSON.stringify(advisor), summary: advisor.summary.join(' ') });

  return {
    advisor,
    confirmation: changeProposal,
  };
}
