export const underwritingSchema = {
  type: 'object',
  required: ['property_profile', 'income', 'expenses', 'debt', 'assumptions'],
  additionalProperties: false,
  properties: {
    property_profile: { type: 'object', additionalProperties: true },
    income: { type: 'object', additionalProperties: true },
    expenses: { type: 'object', additionalProperties: true },
    debt: { type: 'object', additionalProperties: true },
    assumptions: { type: 'object', additionalProperties: true },
  },
};

export const defaultUnderwritingPayload = {
  property_profile: {},
  income: {},
  expenses: {},
  debt: {},
  assumptions: {},
};
