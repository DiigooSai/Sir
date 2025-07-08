import { getAllCoursesUserController, getCourseByIdUserController } from '@/controllers/nest-nest/lms/user/course.controller';
import { zodIdSchema } from '@/db/common-schemas';
import { requireNestUserAuth } from '@/middlewares';
import { zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';

export const nestLmsUserCourseRoutes = new Hono();

nestLmsUserCourseRoutes.get('/', requireNestUserAuth, getAllCoursesUserController);
nestLmsUserCourseRoutes.get('/:_id', requireNestUserAuth, zParamsValidator(zodIdSchema), getCourseByIdUserController);
