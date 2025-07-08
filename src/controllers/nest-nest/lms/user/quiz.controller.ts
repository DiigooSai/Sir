import { CONTEXT_STATE } from '@/constants/hono-context';
import { ACTIONS, AssetLedgerModel } from '@/db/models/nige-nest/asset-ledger';
import { NestQuizAttemptModel } from '@/db/models/nige-nest/lms/quiz-attempt';
import { redisClient } from '@/db/redis';
import { getQuizzesForChapter } from '@/services/nige-nest/lms/get-services';
import { getAllAttempts, startQuizAttempt, stripCorrectIndexFromAttempt, submitQuizAttempt } from '@/services/nige-nest/lms/quiz-attempt';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';

export async function getQuizzesForChapterUserController(c: Context) {
  const { chapterId } = c.req.param();
  const list = await getQuizzesForChapter(chapterId);
  return c.json(new ApiResponse(200, list, 'Quizzes fetched'));
}

export async function startQuizAttemptController(c: Context) {
  const { quizId } = c.req.param();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const attempt = await startQuizAttempt(accountId, quizId);
  // compute ms left from the TTL, for a sanity check UX
  const pttl = await redisClient.pttl(`quiz:attempt:${attempt._id.toString()}`);

  const questions = (attempt.quizSnapshot as any).questions;
  const questionsWithoutAnswers = questions?.map((question) => ({ prompt: question?.prompt, options: question?.options }));

  return c.json(
    new ApiResponse(200, {
      attemptId: attempt._id,
      startAt: attempt.startAt,
      expiresAt: attempt.expiresAt,
      pttlMs: pttl > 0 ? pttl : 0,
      questions: questionsWithoutAnswers,
    }),
    200
  );
}

export async function getAllAttemptsUserController(c: Context) {
  const { quizId } = c.req.param();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const attempts = await getAllAttempts(accountId, quizId ? { quizIds: [quizId], includeInactive: true } : undefined);
  return c.json(new ApiResponse(200, attempts, 'Attempts fetched successfully'), 200);
}

export async function getAllActiveAttemptsUserController(c: Context) {
  const { quizId } = c.req.param();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const activeAttempts = await getAllAttempts(accountId, { includeInactive: true, quizIds: quizId ? [quizId] : undefined });
  return c.json(new ApiResponse(200, activeAttempts, 'Active attempts fetched successfully'), 200);
}

export async function getQuizAttemptByIdController(c: Context) {
  const { attemptId } = c.req.param();
  const att = await NestQuizAttemptModel.findById(attemptId).lean();
  if (!att) return c.json(new ApiResponse(404, null, 'Attempt not found'), 404);

  // how many ms remain on the Redis key (could be -1 if already expired)
  const pttl = await redisClient.pttl(`quiz:attempt:${att._id.toString()}`);
  const alreadySubmitted = att.submittedAt !== null;
  const questions = (att.quizSnapshot as any).questions;
  const questionsWithoutAnswers = stripCorrectIndexFromAttempt(att).quizSnapshot?.questions;
  const questionWithAttemptAnswers = questions?.map((question, i) => {
    const answerIdx = att.answers?.[i];
    return {
      ...question,
      answer: typeof answerIdx === 'number' && !Number.isNaN(answerIdx) ? answerIdx : null,
    };
  });
  const attemptCount = att.attemptCount;
  let reward = {
    amount: null,
    assetLedgerId: null,
  };
  if (attemptCount === 1 && alreadySubmitted) {
    const rewardAssetLedger = await AssetLedgerModel.findOne({
      action: ACTIONS.QUIZ_ATTEMPT_REWARD,
      quizAttemptId: att._id,
    }).lean();
    reward = {
      amount: rewardAssetLedger?.amount,
      assetLedgerId: rewardAssetLedger?._id,
    };
  }
  const timeRemaining = att.expiresAt ? new Date(att.expiresAt).getTime() - Date.now() : 0;

  return c.json(
    new ApiResponse(200, {
      attemptId: att._id,
      startAt: att.startAt,
      expiresAt: att.expiresAt,
      pttlMs: timeRemaining,
      questions: alreadySubmitted ? questionWithAttemptAnswers : questionsWithoutAnswers,
      alreadySubmitted: alreadySubmitted,
      ...(alreadySubmitted
        ? {
            score: att.score,
            attemptCount,
            comments: att.comments,
            ...(attemptCount === 1 && !!reward?.assetLedgerId ? { reward } : {}),
          }
        : {}),
    }),
    200
  );
}

export async function submitQuizUserController(c: Context) {
  const { attemptId } = c.req.param();
  const { answers } = (await c.req.json()) as { answers: number[] };
  const result = await submitQuizAttempt(attemptId, answers);
  return c.json(new ApiResponse(200, result), 200);
}
