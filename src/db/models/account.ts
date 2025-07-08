import { createModel, createSchema } from '../base';

export interface IAccount {
  balance: number;
  system?: boolean; // true for the treasury account
  isInternal?: boolean; // true for internal/system accounts
  walletId?: string;
}

const AccountSchema = createSchema<IAccount>({
  balance: { type: Number, default: 0 },
  system: { type: Boolean, default: false },
  isInternal: { type: Boolean, default: false },
  walletId: { type: String, default: null },
});

// ——————————————
// ensure at most one doc can have system === true
// ——————————————

export const AccountModel = createModel<IAccount>('Account', AccountSchema);
