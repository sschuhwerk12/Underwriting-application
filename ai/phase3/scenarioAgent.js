import { scenarioResponseSchema } from '../../lib/underwritingSchema/phase3Schemas.js';
import { buildPhase3Context } from './context.js';

export async function createScenarioSet({ dealId }) {
  const context = await buildPhase3Context({ dealId });
  const model = context.model?.modelFields || {};

  const base = [
    { field: 'exitCapRate', delta: 0, note: 'Base case keeps current terminal cap assumption.' },
    { field: 'growthByYear', delta: [0], note: 'Base growth unchanged versus current underwriting.' },
  ];
  const upside = [
    { field: 'exitCapRate', delta: -0.0025, note: 'Tighter exit cap for favorable capital markets.' },
    { field: 'saleCostPct', delta: -0.0025, note: 'Slightly lower disposition cost load.' },
    { field: 'initialLtv', delta: 0.02, note: 'Incrementally higher leverage if debt markets improve.' },
  ];
  const downside = [
    { field: 'exitCapRate', delta: 0.005, note: 'Wider exit cap to reflect adverse pricing.' },
    { field: 'saleCostPct', delta: 0.005, note: 'Higher sales friction in weaker liquidity.' },
    { field: 'initialLtv', delta: -0.03, note: 'Lower debt proceeds under tighter underwriting.' },
  ];

  const growthBase = Array.isArray(model.growthByYear) && model.growthByYear.length ? model.growthByYear[0] : null;
  const inflBase = Array.isArray(model.inflationByYear) && model.inflationByYear.length ? model.inflationByYear[0] : null;

  const sensitivities = [
    {
      name: 'Exit Cap Sensitivity',
      field: 'exitCapRate',
      grid: [-0.005, -0.0025, 0, 0.0025, 0.005],
      note: 'Apply as additive deltas to current exitCapRate.',
    },
    {
      name: 'Rent Growth Year-1 Sensitivity',
      field: 'growthByYear[0]',
      grid: [
        growthBase == null ? null : growthBase - 0.01,
        growthBase,
        growthBase == null ? null : growthBase + 0.01,
      ],
      note: 'Requires user-provided market evidence to justify upside/downside rent growth.',
    },
    {
      name: 'Expense Inflation Year-1 Sensitivity',
      field: 'inflationByYear[0]',
      grid: [
        inflBase == null ? null : inflBase - 0.005,
        inflBase,
        inflBase == null ? null : inflBase + 0.005,
      ],
      note: 'Stress operating cost pressure with conservative downside inflation.',
    },
  ];

  return scenarioResponseSchema.parse({
    deal_id: context.deal.deal_id,
    as_of: new Date().toISOString(),
    scenarios: {
      base: { deltas: base },
      upside: { deltas: upside },
      downside: { deltas: downside },
    },
    sensitivities,
    apply_requires_confirmation: true,
  });
}
