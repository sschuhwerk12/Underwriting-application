import { z } from 'zod';

const nullableNumber = z.number().finite().nullable();
const boundedNullable = (min, max) => z.number().min(min).max(max).nullable();

export const phase2UnderwritingSchema = z.object({
  property_profile: z.object({
    property_name: z.string().nullable().default(null),
    address: z.string().nullable().default(null),
    property_type: z.enum(['Office', 'Industrial', 'Retail', 'Multifamily', 'Other']).nullable().default(null),
    gross_sf: z.number().nonnegative().nullable().default(null),
    acquisition_date: z.string().nullable().default(null),
  }).strict(),
  income: z.object({
    in_place_rent_psf_year: z.number().nonnegative().nullable().default(null),
    occupancy_rate: boundedNullable(0, 1).default(null),
    annual_gross_income: z.number().nonnegative().nullable().default(null),
  }).strict(),
  expenses: z.object({
    opex_psf_year: z.number().nonnegative().nullable().default(null),
    taxes_annual: z.number().nonnegative().nullable().default(null),
    insurance_annual: z.number().nonnegative().nullable().default(null),
  }).strict(),
  debt: z.object({
    loan_amount: z.number().nonnegative().nullable().default(null),
    interest_rate: boundedNullable(0, 1).default(null),
    ltv: boundedNullable(0, 1).default(null),
    loan_term_months: z.number().int().nonnegative().nullable().default(null),
  }).strict(),
  assumptions: z.object({
    hold_months: z.number().int().min(1).max(600).nullable().default(null),
    exit_cap_rate: boundedNullable(0, 1).default(null),
    sale_cost_pct: boundedNullable(0, 1).default(null),
    inflation_year_1: boundedNullable(0, 1).default(null),
    inflation_year_2: boundedNullable(0, 1).default(null),
    inflation_year_3: boundedNullable(0, 1).default(null),
    inflation_year_4: boundedNullable(0, 1).default(null),
    inflation_year_5: boundedNullable(0, 1).default(null),
    inflation_year_6: boundedNullable(0, 1).default(null),
    inflation_year_7: boundedNullable(0, 1).default(null),
    inflation_year_8: boundedNullable(0, 1).default(null),
    inflation_year_9: boundedNullable(0, 1).default(null),
    inflation_year_10: boundedNullable(0, 1).default(null),
  }).strict(),
  risks_detected: z.array(z.string()).default([]),
  missing_data: z.array(z.string()).default([]),
}).strict();

export const phase2SchemaDefault = {
  property_profile: {
    property_name: null,
    address: null,
    property_type: null,
    gross_sf: null,
    acquisition_date: null,
  },
  income: {
    in_place_rent_psf_year: null,
    occupancy_rate: null,
    annual_gross_income: null,
  },
  expenses: {
    opex_psf_year: null,
    taxes_annual: null,
    insurance_annual: null,
  },
  debt: {
    loan_amount: null,
    interest_rate: null,
    ltv: null,
    loan_term_months: null,
  },
  assumptions: {
    hold_months: null,
    exit_cap_rate: null,
    sale_cost_pct: null,
    inflation_year_1: null,
    inflation_year_2: null,
    inflation_year_3: null,
    inflation_year_4: null,
    inflation_year_5: null,
    inflation_year_6: null,
    inflation_year_7: null,
    inflation_year_8: null,
    inflation_year_9: null,
    inflation_year_10: null,
  },
  risks_detected: [],
  missing_data: [],
};

export function validatePhase2Extraction(payload) {
  return phase2UnderwritingSchema.safeParse(payload);
}
