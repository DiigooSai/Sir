import { NestQuizModel } from '@/db/models/nige-nest/lms/quiz';
import { NestQuizAttemptModel, type INestQuizAttempt } from '@/db/models/nige-nest/lms/quiz-attempt';
import { redisClient } from '@/db/redis';
import { z } from 'zod';
import { quizReward, withTxn } from '../asset-ledger';
import { Types, type ClientSession } from 'mongoose';
import { loadOrThrow } from '@/services/utils/archive-utils';
import { attempts } from '@/db/redis/nest/attempts';
import { getExchangeAccount } from '@/services/nige-earn/ledger';
import { markTransactionIssue, resolveQuizAttemptTransactionAllIssues } from '../transaction-issues';
import { TRANSACTION_ISSUE_TYPES } from '@/db/models/nige-nest/transactionIssues';

const ATTEMPT_KEY = (id: string) => `quiz:attempt:${id}`;
const GRACE_SEC = 5;

export async function startQuizAttempt(accountId: string, quizId: string, session?: ClientSession): Promise<typeof NestQuizAttemptModel.prototype> {
  const quiz = await loadOrThrow(NestQuizModel, quizId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + quiz.durationSec * 1000);

  const questionsLength = quiz.questions.length;

  return withTxn(session, async (s) => {
    // check if this account already has an attempt
    const attemptCount = await NestQuizAttemptModel.countDocuments({ accountId, quizId }).session(s);

    const [attempt] = await NestQuizAttemptModel.create(
      [
        {
          quizId: new Types.ObjectId(quizId),
          accountId: new Types.ObjectId(accountId),
          answers: Array(questionsLength).fill(-1),
          startAt: now,
          expiresAt,
          submittedAt: null,
          score: 0,
          attemptCount: attemptCount + 1,
          isGraded: false,
          comments: [],
          quizSnapshot: quiz.toObject(),
        },
      ],
      { session: s }
    );
    await redisClient.set(ATTEMPT_KEY(attempt._id.toString()), '1', 'PX', (quiz.durationSec + GRACE_SEC + 60) * 1000);
    return attempt;
  });
}

export async function isAttemptActive(attemptId: string, expiredAt: Date): Promise<boolean> {
  const now = new Date();
  return (await redisClient.exists(ATTEMPT_KEY(attemptId))) === 1 || new Date(now).getTime() < new Date(expiredAt).getTime() + 10000;
}

const AnswersZ = z.array(z.number().int()).or(z.null());
type Answers = z.infer<typeof AnswersZ>;

interface QuizRewardParams {
  quizAttemptId: string;
  numCoins: number;
}
export async function processQuizReward(
  { quizAttemptId, numCoins }: QuizRewardParams,
  session?: ClientSession
): Promise<{
  success: boolean;
}> {
  // find the quiz attempt
  const attempt = await NestQuizAttemptModel.findById(quizAttemptId).session(session ?? null);
  if (!attempt) {
    throw new Error(`Attempt ${quizAttemptId} not found`);
  }
  const accountId = attempt.accountId;
  const exchangeAcc = await getExchangeAccount();
  if (exchangeAcc.balance < numCoins) {
    // not enough balance → record an issue
    console.log('marking issue for attempt', quizAttemptId);
    await markTransactionIssue({
      issue: TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD,
      amount: numCoins,
      quizAttemptId,
    });
    return {
      success: false,
    };
  } else {
    // enough balance → send reward and clear any prior issues
    await quizReward({ accountId, numCoins, quizAttemptId }, session);
    await resolveQuizAttemptTransactionAllIssues(quizAttemptId, session);
    return {
      success: true,
    };
  }
}

export async function submitQuizAttempt(
  attemptId: string,
  rawAnswers: Answers,
  session?: ClientSession
): Promise<{ score?: number; isLate?: boolean; comments?: string[]; alreadyProcessing: boolean }> {
  try {
    if (attempts.has(attemptId)) return { alreadyProcessing: true };
    attempts.add(attemptId);
    const result = await withTxn(session, async (s) => {
      const att = await loadOrThrow(NestQuizAttemptModel, attemptId, s);
      const questionsLength = att?.quizSnapshot?.questions?.length;
      const answers = Array.isArray(rawAnswers) && rawAnswers?.length === questionsLength ? rawAnswers : Array(questionsLength).fill(-1);
      const now = new Date();
      const active = await isAttemptActive(attemptId, att.expiresAt);
      let isLate = false;
      const comments: string[] = [];

      if (!active) {
        isLate = true;
        comments.push('Late submission');
      }

      const nestAttempt = await NestQuizAttemptModel.findOne({
        _id: attemptId,
      });
      const questions = nestAttempt?.quizSnapshot?.questions;
      att.submittedAt = now;
      att.answers = answers === null || answers?.length !== questions?.length ? questions?.map(() => -1) : answers;
      if (!isLate) {
        const snap = att.quizSnapshot as {
          questions: Array<{ correctIndex: number }>;
          reward50: number;
          reward100: number;
          shouldStopRewarding: boolean;
        };

        // score
        att.score = snap.questions.reduce((sum, q, i) => sum + (q.correctIndex === answers[i] ? 1 : 0), 0);
        console.log('calculated score', att.score);

        // reward
        if (att.attemptCount === 1 && !snap.shouldStopRewarding) {
          if (att.score === snap.questions.length && snap.reward100) {
            await processQuizReward({ quizAttemptId: attemptId, numCoins: snap.reward100 }, s);
          } else if (att.score >= Math.ceil(snap.questions.length / 2) && snap.reward50) {
            await processQuizReward({ quizAttemptId: attemptId, numCoins: snap.reward50 }, s);
          }
        }
      } else {
        att.score = 0;
      }

      att.comments.push(...comments);
      await att.save({ session: s });

      await redisClient.del(ATTEMPT_KEY(attemptId));

      return { score: att.score, isLate, comments: att.comments, alreadyProcessing: true };
    });
    attempts.remove(attemptId);
    return result;
  } catch (e) {
    console.log('error', e);
    attempts.remove(attemptId);
  }
}

interface GetAllAttemptsOptions {
  /** If true, include both active and inactive attempts. */
  includeInactive?: boolean;
  /** If true, include both archived and non-archived attempts. */
  includeArchived?: boolean;
  quizIds?: string[];
}
export async function getAllAttempts(
  accountId: string,
  { includeInactive = false, includeArchived = false, quizIds }: GetAllAttemptsOptions = {}
): Promise<INestQuizAttempt[]> {
  // 1. Build Mongo filter
  const filter: Record<string, any> = { accountId };
  if (!includeArchived) {
    filter.archivedAt = null;
  }
  if (Array.isArray(quizIds) && quizIds.length > 0) {
    filter.quizId = { $in: quizIds };
  }

  // 2. Fetch raw attempts
  const rawAttempts = await NestQuizAttemptModel.find(filter).lean().exec();

  const results: INestQuizAttempt[] = [];

  // 3. Process each attempt
  for (const raw of rawAttempts) {
    const active = await isAttemptActive(raw._id.toString(), raw.expiresAt);

    // 3a. Skip inactive unless we explicitly include them
    if (!includeInactive && !active) {
      continue;
    }
    if (active) {
      // 3b. Active ⇒ strip correctIndex & remove answers
      let sanitized = stripCorrectIndexFromAttempt(raw);
      const { answers, ...withoutAnswers } = sanitized;
      results.push(withoutAnswers as INestQuizAttempt);
    } else {
      // 3c. Inactive ⇒ return raw, untouched
      results.push(raw as INestQuizAttempt);
    }
  }
  return results;
}

export function stripCorrectIndexFromAttempt(attemptOrDoc: INestQuizAttempt | (Document & Partial<INestQuizAttempt>)): INestQuizAttempt {
  // 1) get a plain object
  const attempt: INestQuizAttempt =
    // if it's a mongoose doc, use toObject()
    typeof (attemptOrDoc as any).toObject === 'function'
      ? (attemptOrDoc as any).toObject()
      : // otherwise assume it's already a plain object
        (attemptOrDoc as INestQuizAttempt);

  // 2) rebuild quizSnapshot.questions without correctIndex
  const { quizSnapshot, comments, createdAt, score, startAt, updatedAt, ...rest } = attempt;
  const sanitizedQuestions = quizSnapshot.questions.map((q) => {
    // pull out correctIndex, keep the rest
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { correctIndex, ...keep } = q as any;
    return keep;
  });

  // 3) return a brand new object
  return {
    ...rest,
    quizSnapshot: {
      questions: sanitizedQuestions,
    },
  };
}
