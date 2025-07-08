import { z } from 'zod';

// !!! BEWARE DATA USED IN API RESPONSES !!!
export const BUDGET_RANGES = {
  Micro: { min: 600, max: 1500 },
  Simple: { min: 1500, max: 12500 },
  Small: { min: 12500, max: 75000 },
  Medium: { min: 75000, max: 150000 },
  Large: { min: 150000, max: 250000 },
  Larger: { min: 250000, max: 500000 },
  Complex: { min: 500000, max: 1000000 },
  Huge: { min: 1000000, max: 2500000 },
  Major: { min: 2500000, max: 100000000 },
} as const;

type BudgetKey = keyof typeof BUDGET_RANGES;
const budgetKeys = Object.keys(BUDGET_RANGES) as BudgetKey[];
export const budgetEnum = z.enum(budgetKeys as [BudgetKey, ...BudgetKey[]]);
export type BudgetEnum = z.infer<typeof budgetEnum>;
