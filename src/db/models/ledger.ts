import { Schema, Types } from 'mongoose';
import { LEDGER_TYPES } from '@/constants/ledger';
import { createModel, createSchema } from '../base';
import { z } from 'zod';
import { dateSchema, idOrNull } from '../common-schemas';

export interface ILedger {
  debitAccount: Schema.Types.ObjectId | null;
  creditAccount: Schema.Types.ObjectId | null;
  amount: number;
  type: keyof typeof LEDGER_TYPES;
  meta: Record<string, any>;
  timestamp: Date;
  nestLedgerId?: Schema.Types.ObjectId | null;
}

const LedgerSchema = createSchema<ILedger>({
  debitAccount: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  creditAccount: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  meta: { type: Object, default: {} },
  timestamp: { type: Date, default: () => new Date() },
  nestLedgerId: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null },
});

export const LedgerModel = createModel<ILedger>('NigeCoinLedger', LedgerSchema);

export const LedgerQuerySchema = z
  .object({
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1))
      .refine((n) => n > 0, { message: 'page must be ≥ 1' }),
    pageSize: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 50))
      .refine((n) => n > 0 && n <= 500, {
        message: 'pageSize must be between 1 and 500',
      }),

    debitAccount: idOrNull, // coerced to valid string or "null" or undefined
    creditAccount: idOrNull,

    dateFrom: dateSchema,
    dateTo: dateSchema,

    type: z.string().optional(),
  })
  .refine((d) => !d.dateFrom || !d.dateTo || d.dateFrom.getTime() <= d.dateTo.getTime(), { message: 'dateFrom must be ≤ dateTo' });
