import bcrypt from 'bcryptjs';
import { Schema } from 'mongoose';
import { createModel, createSchema } from '../base';

export interface IOrgCredential {
  accountId: Schema.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  permissions: string[];
}

const OrgCredentialSchema = createSchema<IOrgCredential>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      uniqueCombination: true, // unique per-account
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    permissions: { type: [String], default: [] },
  },
  { indexes: [{ accountId: 1, email: 1, unique: true }] }
);

/* ───────────────────── helpers ───────────────────── */
OrgCredentialSchema.methods.setPassword = async function (plain: string) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

OrgCredentialSchema.methods.checkPassword = async function (plain: string) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const OrgCredentialModel = createModel<IOrgCredential>('OrgCredential', OrgCredentialSchema);
