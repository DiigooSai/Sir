import { createModel, createSchema } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema } from 'mongoose';
import { z } from 'zod';

export const inNestEntryZ = z.object({
  accountId: mongoIdZod,
  nestId: mongoIdZod,
  eggCount: z.number().min(1),
  areGemsDistributed: mongoIdZod.nullable(),
  areCooled: mongoIdZod.nullable(),
  gotCancelled: mongoIdZod.nullable(),
});

export const createInNestEntryZodSchema = inNestEntryZ.pick({
  eggCount: true,
});

export type IInNestEntry = z.infer<typeof inNestEntryZ>;

const inNestEntrySchema = createSchema<IInNestEntry>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  nestId: { type: Schema.Types.ObjectId, ref: 'Nest', required: true },
  eggCount: { type: Number, required: true, min: 1 },
  areGemsDistributed: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null }, // store  EGGING_GEM: 'egging-gem' entry
  areCooled: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null }, // store  EGGING_EGG: 'egging-egg' entry
  gotCancelled: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null },
});

export const InNestEntryModel = createModel<IInNestEntry>('InNestEntry', inNestEntrySchema);
