import { requireSuperAdminAuth } from '@/middlewares';
import { NestQuizZ, UpdateQuizInput } from '@/db/models/nige-nest/lms/quiz';
import { zParamsValidator, zJsonValidator } from '@/utils/zValidators';
import { mongoIdZod, zodIdSchema } from '@/db/common-schemas';
import { Hono } from 'hono';
import {
  archiveQuizController,
  createQuizController,
  getQuizByIdAdminController,
  getQuizzesForChapterAdminController,
  stopRewardingQuizController,
  updateQuizController,
} from '@/controllers/nest-nest/lms/admin/quiz.controller';
import { z } from 'zod';

export const nestLmsAdminQuizRoutes = new Hono();

/* ① list all quizzes (archived included) for one chapter */
nestLmsAdminQuizRoutes.get(
  '/chapter/:chapterId',
  requireSuperAdminAuth,
  zParamsValidator(z.object({ chapterId: mongoIdZod })),
  getQuizzesForChapterAdminController
);

nestLmsAdminQuizRoutes.get(
  '/:quizId',
  requireSuperAdminAuth,
  zParamsValidator(
    z.object({
      quizId: mongoIdZod,
    })
  ),
  getQuizByIdAdminController
);

/* ② create a quiz for a chapter (body validated) */
nestLmsAdminQuizRoutes.post(
  '/:chapterId',
  requireSuperAdminAuth,
  zParamsValidator(
    NestQuizZ.pick({
      chapterId: true,
    })
  ),
  zJsonValidator(
    NestQuizZ.pick({
      durationSec: true,
      questions: true,
      reward50: true,
      reward100: true,
    })
  ),
  createQuizController
);

/* ③ soft-archive a quiz */
nestLmsAdminQuizRoutes.patch('/archive', requireSuperAdminAuth, zJsonValidator(z.object({ quizId: mongoIdZod })), archiveQuizController);

/* ④ stop rewarding a quiz */
nestLmsAdminQuizRoutes.patch('/stop-reward', requireSuperAdminAuth, zJsonValidator(z.object({ quizId: mongoIdZod })), stopRewardingQuizController);

// edit quiz (dynamic route, keep it after static routes)
nestLmsAdminQuizRoutes.patch(
  '/:quizId',
  requireSuperAdminAuth,
  zParamsValidator(z.object({ quizId: mongoIdZod })),
  zJsonValidator(UpdateQuizInput),
  updateQuizController
);
