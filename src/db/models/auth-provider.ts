import { Schema } from 'mongoose';
import { createModel, createSchema } from '../base';

export interface IAuthProvider {
  accountId: Schema.Types.ObjectId;
  provider: 'twitter' | 'github' | 'google';
  providerUserId: string;
}

const AuthProviderSchema = createSchema<IAuthProvider>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    provider: { type: String, required: true },
    providerUserId: { type: String, required: true },
  },
  {
    indexes: [{ provider: 1, providerUserId: 1, unique: true }],
  }
);

export const AuthProviderModel = createModel<IAuthProvider>('AuthProvider', AuthProviderSchema);
