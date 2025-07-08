import { getChapterByIdUserController } from '@/controllers/nest-nest/lms/user/chapter.controller';
import { zodIdSchema } from '@/db/common-schemas';
import { requireNestUserAuth } from '@/middlewares';
import { zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';

export const nestLmsUserChapterRoutes = new Hono();

nestLmsUserChapterRoutes.get('/:_id', requireNestUserAuth, zParamsValidator(zodIdSchema), getChapterByIdUserController);
