import {
  archiveCourseController,
  createCourseController,
  getAllCoursesAdminController,
  getCourseByIdAdminController,
  updateCourseController,
} from '@/controllers/nest-nest/lms/admin/course.controller';
import { mongoIdZod, zodIdSchema } from '@/db/common-schemas';
import { nestCourseZ, UpdateCourseInput } from '@/db/models/nige-nest/lms/course';
import { requireSuperAdminAuth } from '@/middlewares';
import { zJsonValidator, zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const nestLmsAdminCourseRoutes = new Hono();

nestLmsAdminCourseRoutes.get('/', requireSuperAdminAuth, getAllCoursesAdminController);
nestLmsAdminCourseRoutes.post('/', requireSuperAdminAuth, zJsonValidator(nestCourseZ), createCourseController);
nestLmsAdminCourseRoutes.get('/:_id', requireSuperAdminAuth, zParamsValidator(zodIdSchema), getCourseByIdAdminController);
nestLmsAdminCourseRoutes.patch('/archive', requireSuperAdminAuth, zJsonValidator(z.object({ courseId: mongoIdZod })), archiveCourseController);
nestLmsAdminCourseRoutes.patch(
  '/:courseId',
  requireSuperAdminAuth,
  zParamsValidator(z.object({ courseId: mongoIdZod })),
  zJsonValidator(UpdateCourseInput),
  updateCourseController
);
