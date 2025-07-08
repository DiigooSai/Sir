import { createModel, createSchema } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema } from 'mongoose';
import { z } from 'zod';

export const userNestUnlockZ = z.object({
  accountId: mongoIdZod,
  nestId: mongoIdZod,
});

export type IUserNestUnlock = z.infer<typeof userNestUnlockZ>;

const userNestUnlockSchema = createSchema<IUserNestUnlock>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  nestId: { type: Schema.Types.ObjectId, ref: 'Nest', required: true },
});

export const UserNestUnlockModel = createModel<IUserNestUnlock>('UserNestUnlock', userNestUnlockSchema);
