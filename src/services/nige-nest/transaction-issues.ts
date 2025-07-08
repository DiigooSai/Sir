import {
  quizAttemptRewardZ,
  TRANSACTION_ISSUE_TYPES,
  TransactionIssueModel,
  userSignupCoinBonusZ,
  userSignupEggBonusZ,
  userSignupGemBonusZ,
} from '@/db/models/nige-nest/transactionIssues';
import { type ClientSession } from 'mongoose';
import { z } from 'zod';

const userSignupEggInputZ = z
  .object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS),
  })
  .merge(userSignupEggBonusZ);

const userSignupGemInputZ = z
  .object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS),
  })
  .merge(userSignupGemBonusZ);

const userSignupCoinInputZ = z
  .object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS),
  })
  .merge(userSignupCoinBonusZ);

const quizAttemptRewardInputZ = z
  .object({
    issue: z.literal(TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD),
  })
  .merge(quizAttemptRewardZ);

export const TransactionIssueInputZ = z.discriminatedUnion('issue', [
  userSignupEggInputZ,
  userSignupGemInputZ,
  userSignupCoinInputZ,
  quizAttemptRewardInputZ,
]);

export const markTransactionIssue = async (input: z.infer<typeof TransactionIssueInputZ>, session?: ClientSession) => {
  if (input.issue === TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS) {
    const { issue, eggBonusAmount, userAccountId } = userSignupEggInputZ.parse(input);
    // there should not be any unresolved issues for this quiz attempt
    const alreadyTransactionIssueListed = await TransactionIssueModel.findOne({
      issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS,
      'meta.userAccountId': userAccountId,
    }).lean();

    if (alreadyTransactionIssueListed) {
      return alreadyTransactionIssueListed._id;
    }
    const [issueDoc] = await TransactionIssueModel.create(
      [{ issue, meta: { userAccountId, eggBonusAmount }, message: `Reward for user, id: ${userAccountId}` }],
      { session }
    );
    return issueDoc._id;
  } else if (input.issue === TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS) {
    const { issue, gemBonusAmount, userAccountId } = userSignupGemInputZ.parse(input);
    // there should not be any unresolved issues for this quiz attempt
    const alreadyTransactionIssueListed = await TransactionIssueModel.findOne({
      issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS,
      'meta.userAccountId': userAccountId,
    }).lean();

    if (alreadyTransactionIssueListed) {
      return alreadyTransactionIssueListed._id;
    }
    const [issueDoc] = await TransactionIssueModel.create(
      [{ issue, meta: { userAccountId, gemBonusAmount }, message: `Reward for user, id: ${userAccountId}` }],
      { session }
    );
    return issueDoc._id;
  } else if (input.issue === TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS) {
    const { issue, coinBonusAmount, userAccountId } = userSignupCoinInputZ.parse(input);
    // there should not be any unresolved issues for this quiz attempt
    const alreadyTransactionIssueListed = await TransactionIssueModel.findOne({
      issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS,
      'meta.userAccountId': userAccountId,
    }).lean();

    if (alreadyTransactionIssueListed) {
      return alreadyTransactionIssueListed._id;
    }
    const [issueDoc] = await TransactionIssueModel.create(
      [{ issue, meta: { userAccountId, coinBonusAmount }, message: `Reward for user, id: ${userAccountId}` }],
      { session }
    );
    return issueDoc._id;
  } else if (input.issue === TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD) {
    const { issue, amount, quizAttemptId } = quizAttemptRewardInputZ.parse(input);
    // there should not be any unresolved issues for this quiz attempt
    const alreadyTransactionIssueListed = await TransactionIssueModel.findOne({
      issue: TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD,
      'meta.quizAttemptId': quizAttemptId,
    }).lean();

    if (alreadyTransactionIssueListed) {
      return alreadyTransactionIssueListed._id;
    }
    const [issueDoc] = await TransactionIssueModel.create(
      [{ issue, meta: { quizAttemptId, amount }, message: `Reward for quiz attempt, id: ${quizAttemptId}` }],
      { session }
    );
    return issueDoc._id;
  } else {
    throw new Error('Invalid issue type');
  }
};

export const resolveQuizAttemptTransactionAllIssues = async (quizAttemptId: string, session?: ClientSession) => {
  await TransactionIssueModel.updateMany(
    {
      issue: TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD,
      'meta.quizAttemptId': quizAttemptId,
      isResolved: false,
    },
    {
      $set: { isResolved: true },
    },
    { session }
  );
};

export const resolveUserSignupEggBonus = async (userAccountId: string, session?: ClientSession) => {
  await TransactionIssueModel.updateMany(
    {
      issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS,
      'meta.userAccountId': userAccountId,
      isResolved: false,
    },
    {
      $set: { isResolved: true },
    },
    { session }
  );
};

export const resolveUserSignupGemBonus = async (userAccountId: string, session?: ClientSession) => {
  await TransactionIssueModel.updateMany(
    {
      issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS,
      'meta.userAccountId': userAccountId,
      isResolved: false,
    },
    {
      $set: { isResolved: true },
    },
    { session }
  );
};

export const resolveUserSignupCoinBonus = async (userAccountId: string, session?: ClientSession) => {
  await TransactionIssueModel.updateMany(
    {
      issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS,
      'meta.userAccountId': userAccountId,
      isResolved: false,
    },
    {
      $set: { isResolved: true },
    },
    { session }
  );
};
