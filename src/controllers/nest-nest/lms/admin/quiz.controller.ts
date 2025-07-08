import { ApiResponse } from '@/utils/ApiResponse';
import { createQuiz, updateQuiz } from '@/services/nige-nest/lms/quiz';
import { archiveQuiz, stopRewardingQuiz } from '@/services/nige-nest/lms/quiz';
import type { Context } from 'hono';
import { getQuizById, getQuizzesForChapter, type GetQuizOptions } from '@/services/nige-nest/lms/get-services';
import type { INestQuiz, UpdateQuizDTO } from '@/db/models/nige-nest/lms/quiz';

/* ───── list ───── */
export async function getQuizzesForChapterAdminController(c: Context) {
  const { chapterId } = c.req.param();
  const list = await getQuizzesForChapter(chapterId, { includeArchived: true });
  return c.json(new ApiResponse(200, list, 'Quizzes fetched'));
}

/* ───── get quiz by id ───── */
export async function getQuizByIdAdminController(c: Context) {
  const { quizId } = c.req.param();

  const opts: GetQuizOptions = {
    includeArchived: true,
    includeStoppedRewarding: true,
  };

  const quiz = await getQuizById(quizId, opts);
  return c.json(new ApiResponse(200, quiz, 'Quiz fetched successfully'));
}

export async function getQuizByIdUserController(c: Context) {
  const { quizId } = c.req.param();

  const opts: GetQuizOptions = {
    includeArchived: true,
    includeStoppedRewarding: true,
  };

  const quiz = await getQuizById(quizId, opts);
  return c.json(new ApiResponse(200, quiz, 'Quiz fetched successfully'));
}

/* ───── create ─────  body validated in router */
export async function createQuizController(c: Context) {
  const { chapterId } = c.req.param();
  const { durationSec, questions, reward100, reward50 }: Pick<INestQuiz, 'durationSec' | 'questions' | 'reward50' | 'reward100'> = await c.req.json(); // already validated
  const quiz = await createQuiz({ durationSec, questions, reward100, reward50, chapterId });
  return c.json(new ApiResponse(201, quiz, 'Quiz created'), 201);
}
/* ───── update ─────  body validated in router */

export async function updateQuizController(c: Context) {
  const { quizId } = c.req.param();
  const { durationSec, questions, reward50, reward100 } = (await c.req.json()) as UpdateQuizDTO;
  const updated = await updateQuiz(quizId, { durationSec, questions, reward50, reward100 });
  return c.json(new ApiResponse(200, updated, 'Quiz updated successfully'));
}
/* ───── archive ───── */
export async function archiveQuizController(c: Context) {
  const { quizId } = await c.req.json();
  await archiveQuiz(quizId);
  return c.json(new ApiResponse(200, null, 'Quiz archived'));
}

/* ───── stop reward ───── */
export async function stopRewardingQuizController(c: Context) {
  const { quizId } = await c.req.json();
  await stopRewardingQuiz(quizId);
  return c.json(new ApiResponse(200, null, 'Rewards disabled'));
}
