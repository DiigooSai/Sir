import { Schema, Types } from 'mongoose';
import { createSchema, createModel } from '@/db/base';
import { ASSETS, type AssetType } from './asset';
import { z } from 'zod';
import { gemAmountZ, mongoIdZod } from '@/db/common-schemas';

const giveAwayBaseProps = {
  createdByAccountId: mongoIdZod,
  accountId: mongoIdZod,
  giveawayName: z.string().min(3).max(50),
};

export const GiveAwayCoinEggSchema = z.object({
  amount: z.number().int().positive(),
  ...giveAwayBaseProps,
});

export const GiveAwayGemSchema = z.object({
  amount: gemAmountZ,
  ...giveAwayBaseProps,
});

// create give away schema
const createGiveAwayBaseProps = {
  twitterUserName: z.string().min(3).max(50),
  giveawayName: z.string().min(3).max(50),
};
const createGiveAwayCoinSchema = z.object({
  assetId: z.literal(ASSETS.COIN),
  amount: z.coerce.number().int().positive(),
  ...createGiveAwayBaseProps,
});

const createGiveAwayEggSchema = z.object({
  assetId: z.literal(ASSETS.EGG),
  amount: z.coerce.number().int().positive(),
  ...createGiveAwayBaseProps,
});

const createGiveAwayGemSchema = z.object({
  assetId: z.literal(ASSETS.GEM),
  amount: z.coerce
    .number()
    .positive()
    .refine((v) => Number.isFinite(v) && /^\d+(\.\d{1,2})?$/.test(v.toString()), {
      message: 'Amount must be a decimal up to 2 places',
    }),
  ...createGiveAwayBaseProps,
});

export const createGiveAwaySchema = z.discriminatedUnion('assetId', [createGiveAwayCoinSchema, createGiveAwayEggSchema, createGiveAwayGemSchema]);

/* ───────────────────── Central action map ───────────────────── */
export const ACTIONS = {
  /* Egg-side */
  MINT_EGG: 'mint-egg',
  BURN_EGG: 'burn-egg',
  BUY_EGG: 'buy-egg',
  BREAK_EGG_TO_GEM: 'breakEggToGem',
  CONVERTED_EGG_FROM_GEM: 'convertedEggFromGem',
  IN_NEST: 'inNest',
  EGGING_EGG: 'egging-egg',
  FUND_EXCHANGE_EGG: 'fundExchangeEgg',
  WITHDRAW_EXCHANGE_EGG: 'withdrawExchangeEgg',
  FUND_POOL_EGG: 'fundPoolEgg',
  WITHDRAW_POOL_EGG: 'withdrawPoolEgg',
  RETURN_NEST_EGG: 'returnNestEgg',
  EGG_GIVEAWAY: 'egg-giveaway',

  /* Gem-side */
  MINT_GEM: 'mint-gem',
  BURN_GEM: 'burn-gem',
  /* ▸ sell-gem 3-phase */
  SELL_GEM_INTENT: 'sell-gem-intent',
  SELL_GEM_APPROVE: 'sell-gem-approve',
  SELL_GEM_REJECT: 'sell-gem-reject',

  BREAKED_GEM_FROM_EGG: 'breakedGemFromEgg',
  CONVERT_GEM_TO_EGG: 'convertGemToEgg',
  EGGING_GEM: 'egging-gem',
  FUND_EXCHANGE_GEM: 'fundExchangeGem',
  WITHDRAW_EXCHANGE_GEM: 'withdrawExchangeGem',
  FUND_POOL_GEM: 'fundPoolGem',
  WITHDRAW_POOL_GEM: 'withdrawPoolGem',
  GEM_GIVEAWAY: 'gem-giveaway',

  /* Coin-side */
  FUND_EXCHANGE_COIN: 'fundExchangeCoin',
  WITHDRAW_EXCHANGE_COIN: 'withdrawExchangeCoin',
  FUND_POOL_COIN: 'fundPoolCoin',
  WITHDRAW_POOL_COIN: 'withdrawPoolCoin',
  CONVERT_COIN_TO_GEM: 'convertCoinToGem',
  CONVERTED_GEM_FROM_COIN: 'convertedGemFromCoin',
  CONVERT_COIN_TO_EGG: 'convertCoinToEgg',
  CONVERTED_EGG_FROM_COIN: 'convertedEggFromCoin',
  UNLOCK_NEST: 'unlock-nest',
  QUIZ_ATTEMPT_REWARD: 'quiz-attempt-reward',
  NEST_COIN_GIVEAWAY: 'nest-coin-giveaway',
} as const;

const ACTIONS_ARR = [
  ACTIONS.MINT_EGG,
  ACTIONS.BURN_EGG,
  ACTIONS.BUY_EGG,
  ACTIONS.BREAK_EGG_TO_GEM,
  ACTIONS.CONVERTED_EGG_FROM_GEM,
  ACTIONS.IN_NEST,
  ACTIONS.EGGING_EGG,
  ACTIONS.FUND_EXCHANGE_EGG,
  ACTIONS.WITHDRAW_EXCHANGE_EGG,
  ACTIONS.FUND_POOL_EGG,
  ACTIONS.WITHDRAW_POOL_EGG,
  ACTIONS.RETURN_NEST_EGG,
  ACTIONS.EGG_GIVEAWAY,
  ACTIONS.MINT_GEM,
  ACTIONS.BURN_GEM,
  ACTIONS.SELL_GEM_INTENT,
  ACTIONS.SELL_GEM_APPROVE,
  ACTIONS.SELL_GEM_REJECT,
  ACTIONS.BREAKED_GEM_FROM_EGG,
  ACTIONS.CONVERT_GEM_TO_EGG,
  ACTIONS.EGGING_GEM,
  ACTIONS.FUND_EXCHANGE_GEM,
  ACTIONS.WITHDRAW_EXCHANGE_GEM,
  ACTIONS.FUND_POOL_GEM,
  ACTIONS.WITHDRAW_POOL_GEM,
  ACTIONS.GEM_GIVEAWAY,
  ACTIONS.FUND_EXCHANGE_COIN,
  ACTIONS.WITHDRAW_EXCHANGE_COIN,
  ACTIONS.FUND_POOL_COIN,
  ACTIONS.WITHDRAW_POOL_COIN,
  ACTIONS.CONVERT_COIN_TO_GEM,
  ACTIONS.CONVERTED_GEM_FROM_COIN,
  ACTIONS.CONVERT_COIN_TO_EGG,
  ACTIONS.CONVERTED_EGG_FROM_COIN,
  ACTIONS.UNLOCK_NEST,
  ACTIONS.QUIZ_ATTEMPT_REWARD,
  ACTIONS.NEST_COIN_GIVEAWAY,
] as const;

export const actionEnumZ = z.enum(ACTIONS_ARR);
export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];
export const actionEnum = Object.values(ACTIONS) as readonly Action[];

export const INTENT_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

/* ───────────────────── Extra enums ───────────────────── */
export const IntentStatusArr = [INTENT_STATUSES.PENDING, INTENT_STATUSES.APPROVED, INTENT_STATUSES.REJECTED] as const;
export const zIntentStatus = z.enum(IntentStatusArr);
export type IntentStatus = z.infer<typeof zIntentStatus>;

/* ───────────────────── Interface ───────────────────── */
export interface IAssetLedger {
  assetId: AssetType;
  action: Action;

  debitAccount: Types.ObjectId | null;
  creditAccount: Types.ObjectId | null;
  amount: number;

  /* optional FKs */
  txId?: Types.ObjectId;
  nestInvestmentId?: Types.ObjectId;
  linkedLedgerId?: Types.ObjectId;
  unlockNestId?: Types.ObjectId;
  quizAttemptId?: Types.ObjectId;

  /* new workflow fields */
  status?: IntentStatus | null; // only on SELL_GEM_INTENT
  transactionHash?: string | null; // only on SELL_GEM_APPROVE

  meta: Record<string, any>;
}

/* ───────────────────── Schema ───────────────────── */
const AssetLedgerSchema = createSchema<IAssetLedger>({
  assetId: { type: String, ref: 'Asset', required: true },
  action: { type: String, enum: actionEnum, required: true },

  debitAccount: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  creditAccount: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  amount: { type: Number, min: 0.000001, required: true },

  txId: { type: Schema.Types.ObjectId },
  nestInvestmentId: { type: Schema.Types.ObjectId, ref: 'InNestEntry' },
  linkedLedgerId: { type: Schema.Types.ObjectId },
  unlockNestId: { type: Schema.Types.ObjectId, ref: 'UserNestUnlock' },
  quizAttemptId: { type: Schema.Types.ObjectId, ref: 'NestQuizAttempt' },

  status: { type: String, enum: zIntentStatus.options, default: null },
  transactionHash: { type: String, default: null, unique: true, sparse: true },

  meta: { type: Object, default: {} },
});

/* ─────────── Context-aware validation ─────────── */
AssetLedgerSchema.pre('validate', function (next) {
  const d = this as IAssetLedger;

  /* 1️⃣ mutually-exclusive FK guard (original rule) */
  // if ([d.transactionHash, d.nestInvestmentId, d.linkedLedgerId, d.unlockNestId, d.quizAttemptId].filter(Boolean).length > 1) {
  //   return next(new Error('Provide only one contextual FK'));
  // }

  /* 2️⃣ gem-sell workflow rules – only enforce pending on new intents */
  if (this.isNew && d.action === ACTIONS.SELL_GEM_INTENT) {
    if (d.status !== 'pending') {
      return next(new Error('SELL_GEM_INTENT must start with status=pending'));
    }
  }

  if (d.action === ACTIONS.SELL_GEM_APPROVE) {
    if (!d.linkedLedgerId) return next(new Error('SELL_GEM_APPROVE requires linkedLedgerId'));
    if (!d.transactionHash) return next(new Error('SELL_GEM_APPROVE requires transactionHash'));
  }

  if (d.action === ACTIONS.SELL_GEM_REJECT) {
    if (!d.linkedLedgerId) return next(new Error('SELL_GEM_REJECT requires linkedLedgerId'));
  }

  /* 3️⃣ pre-existing switch-board for other actions (unchanged) */
  switch (d.action) {
    case ACTIONS.BUY_EGG:
      if (!d.transactionHash) return next(new Error('BUY_EGG requires transactionHash'));
      break;

    case ACTIONS.IN_NEST:
    case ACTIONS.EGGING_EGG:
    case ACTIONS.EGGING_GEM:
    case ACTIONS.RETURN_NEST_EGG:
      if (!d.nestInvestmentId) return next(new Error('nestInvestmentId required'));
      break;

    case ACTIONS.BREAK_EGG_TO_GEM:
    case ACTIONS.BREAKED_GEM_FROM_EGG:
    case ACTIONS.CONVERT_GEM_TO_EGG:
    case ACTIONS.CONVERTED_EGG_FROM_GEM:
      if (!d.linkedLedgerId) return next(new Error('linkedLedgerId required'));
      break;

    case ACTIONS.UNLOCK_NEST:
      if (!d.unlockNestId) return next(new Error('unlockNestId required'));
      break;

    case ACTIONS.QUIZ_ATTEMPT_REWARD:
      if (!d.quizAttemptId) return next(new Error('quizAttemptId required'));
      break;
  }

  next();
});
// AssetLedgerSchema.pre<IAssetLedger>('save', async function (next) {
//   if (!this.transactionHash) return next();
//   const exists = await AssetLedgerModel.exists({
//     transactionHash: this.transactionHash,
//     _id: { $ne: this._id },
//   });
//   if (exists) {
//     return next(new Error(`transactionHash "${this.transactionHash}" already in use`));
//   }
//   next();
// });

/* ─────────── Indexes ─────────── */
AssetLedgerSchema.index({ debitAccount: 1, createdAt: -1 });
AssetLedgerSchema.index({ creditAccount: 1, createdAt: -1 });
AssetLedgerSchema.index({ txId: 1 });
AssetLedgerSchema.index({ assetId: 1, action: 1 });
AssetLedgerSchema.index({ nestInvestmentId: 1 });
AssetLedgerSchema.index({ linkedLedgerId: 1 });
AssetLedgerSchema.index({ unlockNestId: 1 });
AssetLedgerSchema.index({ action: 1, status: 1 }); // admin queue
AssetLedgerSchema.index({ linkedLedgerId: 1, action: 1 }); // fast join

export const AssetLedgerModel = createModel<IAssetLedger>('AssetLedger', AssetLedgerSchema);
