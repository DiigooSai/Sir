import { z } from 'zod';
import { createModel, createSchema } from '../base';
import { Schema } from 'mongoose';
import { InternalRoleMakableEnum } from '@/constants';

export interface IInternalCredentials {
  username: string;
  password: string;
  accountId: { type: Schema.Types.ObjectId; ref: 'Account'; required: true };
  archivedAt: Date;
}
export const InternalCredentialsCreateSchema = z
  .object({
    username: z.string().trim().min(3, 'Username must be at least 3 characters'),
    password: z.string().trim().min(3, 'Password must be at least 3 characters'),
    roleId: InternalRoleMakableEnum,
  })
  .strict();

export const InternalCredentialsUpdateSchema = InternalCredentialsCreateSchema.pick({ password: true, roleId: true }).strict();

const InternalCredentialsSchema = createSchema<IInternalCredentials>({
  username: { type: String, default: '', unique: true },
  password: { type: String, default: '' },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
});

export const InternalCredentialsModel = createModel<IInternalCredentials>('InternalCredentials', InternalCredentialsSchema);
