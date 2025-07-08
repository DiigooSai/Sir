import { createModel, createSchema } from '@/db/base';
import mongoose, { Schema } from 'mongoose';
import { z } from 'zod';

export const NEST_ACCOUNT_TYPES = {
  TREASURY: 'treasury',
  EXCHANGE: 'exchange',
  POOL: 'pool',
  USER: 'user',
} as const;

const nestInternalAccountTypes = [NEST_ACCOUNT_TYPES.TREASURY, NEST_ACCOUNT_TYPES.EXCHANGE, NEST_ACCOUNT_TYPES.POOL] as const;
const nestInternalAccountTypeEnum = z.enum(nestInternalAccountTypes);
export type NestInternalAccountTypeEnum = z.infer<typeof nestInternalAccountTypeEnum>;

const nestAccountTypes = [...nestInternalAccountTypes, NEST_ACCOUNT_TYPES.USER] as const;
const nestAccountTypeEnum = z.enum(nestAccountTypes);

export interface INestAccount {
  accountId: Schema.Types.ObjectId;
  eggs: number;
  gems: number;
  accountType: (typeof nestAccountTypes)[number];

  // extra fields
  isGreeted: boolean;
  isTutorialGiven: boolean;
  isDisclaimerGiven: boolean;
  displayName: string | null;
  currentAvatar: String;
  isSignUpBonusEggGiven: {
    addressed: boolean;
    assetLedgerId: Schema.Types.ObjectId | null;
  };
  isSignUpBonusGemGiven: {
    addressed: boolean;
    assetLedgerId: Schema.Types.ObjectId | null;
  };
  isSignUpBonusCoinGiven: {
    addressed: boolean;
    assetLedgerId: Schema.Types.ObjectId | null;
  };
  promocode: {
    addressed: boolean;
    influencerId: Schema.Types.ObjectId | null;
    nestPromoCodeName: string | null;
  };
}

const NestAccountSchema = createSchema<INestAccount>({
  accountType: {
    type: String,
    enum: nestAccountTypeEnum.options,
    required: true,
  },
  accountId: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true,
  },

  eggs: {
    type: Number,
    default: 0,
    min: [0, 'eggs cannot be negative'],
    validate: {
      validator(v: number) {
        return Number.isInteger(v) && v >= 0;
      },
      message: 'eggs must be a whole number',
    },
  },

  gems: {
    type: Number,
    default: 0,
    min: [0, 'gems cannot be negative'],
    set(v: number) {
      const fixed = Math.round(v * 100) / 100;
      const diff = Math.abs(v - fixed);
      if (diff <= 1e-8) return fixed;
      throw new mongoose.Error.ValidatorError({
        message: 'gems can have at most two decimal places',
        path: 'gems',
        value: v,
      });
    },
  },

  isGreeted: { type: Boolean, default: false },
  isTutorialGiven: { type: Boolean, default: false },
  isDisclaimerGiven: { type: Boolean, default: false },

  // now tracked in the schema, defaulting to null
  displayName: { type: String, default: null },

  // your avatar ref
  currentAvatar: {
    type: String,
    // ref: 'Avatar',
    default: null,
  },

  isSignUpBonusEggGiven: {
    addressed: { type: Boolean, default: false },
    assetLedgerId: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null },
  },
  isSignUpBonusGemGiven: {
    addressed: { type: Boolean, default: false },
    assetLedgerId: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null },
  },
  isSignUpBonusCoinGiven: {
    addressed: { type: Boolean, default: false },
    assetLedgerId: { type: Schema.Types.ObjectId, ref: 'AssetLedger', default: null },
  },
  promocode: {
    addressed: { type: Boolean, default: false },
    influencerId: { type: Schema.Types.ObjectId, ref: 'Influencer', default: null },
    nestPromoCodeName: { type: String, default: null },
  },
});

// — enforce unique displayName only for actual strings (skips null/missing)
NestAccountSchema.index(
  { displayName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      displayName: { $type: 'string' },
    },
  }
);

export const NestAccountModel = createModel<INestAccount>('NestAccount', NestAccountSchema);
