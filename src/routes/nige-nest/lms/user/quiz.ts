import { getQuizByIdUserController } from '@/controllers/nest-nest/lms/admin/quiz.controller';
import {
  getAllActiveAttemptsUserController,
  getAllAttemptsUserController,
  getQuizAttemptByIdController,
  getQuizzesForChapterUserController,
  startQuizAttemptController,
  submitQuizUserController,
} from '@/controllers/nest-nest/lms/user/quiz.controller';
import { mongoIdZod } from '@/db/common-schemas';
import { requireNestUserAuth } from '@/middlewares';
import { zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const nestLmsUserQuizRoutes = new Hono();

nestLmsUserQuizRoutes.get(
  '/chapter/:chapterId',
  requireNestUserAuth,
  zParamsValidator(z.object({ chapterId: mongoIdZod })),
  getQuizzesForChapterUserController
);
nestLmsUserQuizRoutes.get(
  '/attempt/info/:attemptId',
  requireNestUserAuth,
  zParamsValidator(z.object({ attemptId: mongoIdZod })),
  getQuizAttemptByIdController
);
nestLmsUserQuizRoutes.get(
  '/allAttempts/:quizId',
  requireNestUserAuth,
  zParamsValidator(z.object({ quizIds: z.array(mongoIdZod).optional() })),
  getAllAttemptsUserController
);
nestLmsUserQuizRoutes.get('/allActive/:quizId', requireNestUserAuth, getAllActiveAttemptsUserController);

nestLmsUserQuizRoutes.get('/attempt/:attemptId', requireNestUserAuth, getQuizAttemptByIdController);
nestLmsUserQuizRoutes.get('/:quizId', requireNestUserAuth, getQuizByIdUserController);
nestLmsUserQuizRoutes.post('/attempt/info/:quizId', requireNestUserAuth, startQuizAttemptController);
nestLmsUserQuizRoutes.post('/attempt/submit/:attemptId', requireNestUserAuth, submitQuizUserController);
