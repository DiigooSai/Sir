import { createModel } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema, Types } from 'mongoose';
import { z } from 'zod';

export const TRANSACTION_ISSUE_TYPES = {
  USER_SIGNUP_EGG_BONUS: 'userSignupEggBonus',
  USER_SIGNUP_GEM_BONUS: 'userSignupGemBonus',
  USER_SIGNUP_COIN_BONUS: 'userSignupCoinBonus',
  QUIZ_ATTEMPT_REWARD: 'quizAttemptReward',
} as const;

// include all three issue-types
export const transactionIssues = [
  TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS,
  TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS,
  TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS,
  TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD,
] as const;
export const transactionIssueEnum = z.enum(transactionIssues);
export type TransactionIssueType = z.infer<typeof transactionIssueEnum>;

const baseTransactionIssueZ = {
  message: z.string().min(1, 'Message is required'),
  isResolved: z.boolean().default(false),
};
export const userSignupEggBonusZ = z.object({
  userAccountId: mongoIdZod,
  eggBonusAmount: z.number().positive(),
});

export const userSignupGemBonusZ = z.object({
  userAccountId: mongoIdZod,
  gemBonusAmount: z.number().positive(),
});
export const userSignupCoinBonusZ = z.object({
  userAccountId: mongoIdZod,
  coinBonusAmount: z.number().positive(),
});

export const quizAttemptRewardZ = z.object({
  quizAttemptId: mongoIdZod,
  amount: z.number().int().positive(),
});

export const TransactionIssueZ = z.discriminatedUnion('issue', [
  z.object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS),
    meta: userSignupEggBonusZ,
    ...baseTransactionIssueZ,
  }),
  z.object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS),
    meta: userSignupGemBonusZ,
    ...baseTransactionIssueZ,
  }),
  z.object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS),
    meta: userSignupCoinBonusZ,
    ...baseTransactionIssueZ,
  }),
  z.object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD),
    meta: quizAttemptRewardZ,
    ...baseTransactionIssueZ,
  }),
]);

export type ITransactionIssue = (
  | {
      issue: typeof TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS;
      meta: {
        userAccountId: Types.ObjectId;
        eggBonusAmount: number;
      };
    }
  | {
      issue: typeof TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS;
      meta: {
        userAccountId: Types.ObjectId;
        gemBonusAmount: number;
      };
    }
  | {
      issue: typeof TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS;
      meta: {
        userAccountId: Types.ObjectId;
        coinBonusAmount: number;
      };
    }
  | {
      issue: typeof TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD;
      meta: {
        quizAttemptId: Types.ObjectId;
        amount: number;
      };
    }
) & {
  message: string;
  isResolved: boolean;
};

const TransactionIssueSchema = new Schema<ITransactionIssue>({
  issue: {
    type: String,
    enum: transactionIssues,
    required: true,
  },
  meta: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator(this: any, val: any) {
        switch (this.issue) {
          case TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS:
            return !!val.userAccountId && val.eggBonusAmount > 0;
          case TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS:
            return !!val.userAccountId && val.gemBonusAmount > 0;
          case TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS:
            return !!val.userAccountId && val.coinBonusAmount > 0;
          case TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD:
            return !!val.quizAttemptId && !isNaN(val.amount) && val.amount > 0;
          default:
            return false;
        }
      },
      // Use function() so `this.issue` is available
      message: function () {
        return `Meta for this issue is missing required fields`;
      },
    },
  },
  message: {
    type: String,
    required: true,
  },
  isResolved: {
    type: Boolean,
    required: true,
    default: false,
  },
});

export const TransactionIssueModel = createModel<ITransactionIssue>('TransactionIssue', TransactionIssueSchema);
