import {
  archiveChapterController,
  createChapterController,
  getChapterByIdAdminController,
  updateChapterController,
} from '@/controllers/nest-nest/lms/admin/chapter.controller';
import { mongoIdZod, zodIdSchema } from '@/db/common-schemas';
import { NestChapterZ, UpdateChapterInput } from '@/db/models/nige-nest/lms/chapter';
import { requireSuperAdminAuth } from '@/middlewares';
import { zJsonValidator, zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const nestLmsAdminChapterRoutes = new Hono();

nestLmsAdminChapterRoutes.post(
  '/:courseId',
  requireSuperAdminAuth,
  zParamsValidator(
    NestChapterZ.pick({
      courseId: true,
    })
  ),
  zJsonValidator(
    NestChapterZ.pick({
      heading: true,
      content: true,
      thumbnailUrl: true,
    })
  ),
  createChapterController
);

nestLmsAdminChapterRoutes.patch('/archive', requireSuperAdminAuth, zJsonValidator(z.object({ chapterId: mongoIdZod })), archiveChapterController);

nestLmsAdminChapterRoutes.patch(
  '/:chapterId',
  requireSuperAdminAuth,
  zParamsValidator(z.object({ chapterId: mongoIdZod })),
  zJsonValidator(UpdateChapterInput),
  updateChapterController
);
nestLmsAdminChapterRoutes.get('/:_id', requireSuperAdminAuth, zParamsValidator(zodIdSchema), getChapterByIdAdminController);
