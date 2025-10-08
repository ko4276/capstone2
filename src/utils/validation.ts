import Joi from 'joi';

// 공통 Pricing Tier 스키마
export const pricingTierSchema = Joi.object({
  price: Joi.number().required(),
  description: Joi.string().required(),
  billingType: Joi.string().required(),
  monthlyTokenLimit: Joi.number().integer().min(0).optional(),
  monthlyGenerationLimit: Joi.number().integer().min(0).optional(),
  monthlyRequestLimit: Joi.number().integer().min(0).optional()
});

// 공통 Pricing 스키마
export const pricingSchema = Joi.object({
  research: pricingTierSchema.optional(),
  standard: pricingTierSchema.optional(),
  enterprise: pricingTierSchema.optional()
}).optional();

// 공통 Metrics 스키마 (임의 키-값 숫자)
export const metricsSchema = Joi.object().pattern(Joi.string(), Joi.number()).optional();

export default {
  pricingTierSchema,
  pricingSchema,
  metricsSchema
};


