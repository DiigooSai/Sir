import { z } from 'zod';
import { Schema } from 'mongoose';
import { createModel, createSchema } from '../base';
import { mongoIdZod } from '../common-schemas';

export const userZ = z.object({
  accountId: mongoIdZod,
  username: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  // Wallet connection fields
  walletAddress: z.string().nullable(),
  walletType: z.enum(['evm', 'solana']).nullable(),
  walletConnectedAt: z.date().nullable(),
  isWalletVerified: z.boolean().default(false),
});
export type IUser = z.infer<typeof userZ>;

const UserSchema = createSchema<IUser>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, unique: true },
  username: { type: String, required: true },
  name: { type: String },
  avatarUrl: { type: String },
  // Wallet connection fields
  walletAddress: { type: String, default: null, sparse: true }, // Sparse index for unique wallet addresses
  walletType: { type: String, enum: ['evm', 'solana'], default: null },
  walletConnectedAt: { type: Date, default: null },
  isWalletVerified: { type: Boolean, default: false },
});

// Ensure wallet addresses are unique when present
UserSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });

export const UserModel = createModel<IUser>('User', UserSchema);
