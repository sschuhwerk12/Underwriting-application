import { fetchDeal, fetchModelFields } from './tools.js';
import { getDealMemory } from './memoryStore.js';

export async function buildPhase3Context({ dealId }) {
  const deal = await fetchDeal(dealId);
  const model = await fetchModelFields(deal.deal_id);
  const memory = await getDealMemory(deal.deal_id);

  return {
    deal,
    model,
    memory,
  };
}

export function buildAssumptionsUsed(modelFields = {}, ingestedSummary = {}) {
  const list = [];
  const push = (field, value, source) => {
    if (value == null || value === '') return;
    list.push({ field, value, source });
  };

  push('purchasePrice', modelFields.purchasePrice, 'user');
  push('grossSf', modelFields.grossSf, 'user');
  push('holdMonths', modelFields.holdMonths, 'user');
  push('exitCapRate', modelFields.exitCapRate, 'user');
  push('saleCostPct', modelFields.saleCostPct, 'user');
  push('debt.initialLtv', modelFields['debt.initialLtv'] ?? modelFields.initialLtv, 'user');

  push('deal_summary.purchase_price', ingestedSummary?.purchase_price, 'ingested');
  push('deal_summary.gross_sf', ingestedSummary?.gross_sf, 'ingested');

  const growth = modelFields.growthByYear;
  if (Array.isArray(growth) && growth.length) push('growthByYear', growth, 'derived');
  const inflation = modelFields.inflationByYear;
  if (Array.isArray(inflation) && inflation.length) push('inflationByYear', inflation, 'derived');

  return list;
}
