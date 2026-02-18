import { z } from 'zod';

const jsonValue = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonValue),
  z.record(jsonValue),
]));

export const advisorResponseSchema = z.object({
  mode: z.enum(['chat', 'recommendation', 'scenario']),
  deal_snapshot: z.object({
    deal_id: z.string().min(1),
    as_of: z.string().min(1),
  }).strict(),
  summary: z.array(z.string()).default([]),
  analysis: z.object({
    income_logic: z.array(z.string()).default([]),
    expense_logic: z.array(z.string()).default([]),
    cap_rate_logic: z.array(z.string()).default([]),
    discount_rate_logic: z.array(z.string()).default([]),
    debt_logic: z.array(z.string()).default([]),
    exit_logic: z.array(z.string()).default([]),
    sensitivity_logic: z.array(z.string()).default([]),
  }).strict(),
  assumptions_used: z.array(z.object({
    field: z.string(),
    value: jsonValue,
    source: z.enum(['user', 'ingested', 'derived']),
  }).strict()).default([]),
  unknowns: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommended_actions: z.array(z.object({
    title: z.string(),
    why: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
  }).strict()).default([]),
  proposed_model_changes: z.array(z.object({
    field: z.string(),
    current_value: jsonValue,
    proposed_value: jsonValue,
    rationale: z.string(),
    confidence: z.enum(['low', 'medium', 'high']),
  }).strict()).default([]),
}).strict();

export const auditResponseSchema = z.object({
  deal_id: z.string().min(1),
  as_of: z.string().min(1),
  errors: z.array(z.object({
    field: z.string(),
    issue: z.string(),
    why_it_matters: z.string(),
    fix: z.string(),
  }).strict()).default([]),
  warnings: z.array(z.object({
    field: z.string(),
    issue: z.string(),
    range_or_rule: z.string(),
    suggestion: z.string(),
  }).strict()).default([]),
  questions: z.array(z.object({
    question: z.string(),
    needed_for: z.string(),
  }).strict()).default([]),
  improvement_suggestions: z.array(z.object({
    title: z.string(),
    details: z.string(),
  }).strict()).default([]),
}).strict();

const deltaSchema = z.object({
  field: z.string(),
  delta: jsonValue,
  note: z.string(),
}).strict();

export const scenarioResponseSchema = z.object({
  deal_id: z.string().min(1),
  as_of: z.string().min(1),
  scenarios: z.object({
    base: z.object({ deltas: z.array(deltaSchema).default([]) }).strict(),
    upside: z.object({ deltas: z.array(deltaSchema).default([]) }).strict(),
    downside: z.object({ deltas: z.array(deltaSchema).default([]) }).strict(),
  }).strict(),
  sensitivities: z.array(z.object({
    name: z.string(),
    field: z.string(),
    grid: z.array(jsonValue),
    note: z.string(),
  }).strict()).min(3),
  apply_requires_confirmation: z.literal(true),
}).strict();

export const advisorRequestSchema = z.object({
  deal_id: z.string().optional(),
  prompt: z.string().min(1),
  mode: z.enum(['chat', 'recommendation', 'scenario']).default('chat'),
  model_fields: z.record(jsonValue).optional(),
  history: z.array(z.object({ role: z.string(), content: z.string() })).default([]),
}).strict();

export const auditRequestSchema = z.object({
  deal_id: z.string().optional(),
  model_fields: z.record(jsonValue).optional(),
  scenario_deltas: z.array(deltaSchema).optional(),
}).strict();

export const scenariosRequestSchema = z.object({
  deal_id: z.string().optional(),
  model_fields: z.record(jsonValue).optional(),
}).strict();

export const applyChangesRequestSchema = z.object({
  deal_id: z.string().optional(),
  confirmationToken: z.string().min(8),
  confirm: z.literal(true),
}).strict();

export function validateSchema(schema, payload) {
  return schema.safeParse(payload);
}
