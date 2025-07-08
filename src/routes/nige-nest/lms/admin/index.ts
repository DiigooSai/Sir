import { Hono } from 'hono';
import { nestLmsAdminCourseRoutes } from './course';
import { nestLmsAdminChapterRoutes } from './chapter';
import { nestLmsAdminQuizRoutes } from './quiz';

export const nestLmsAdminRoutes = new Hono();

nestLmsAdminRoutes.route('/course', nestLmsAdminCourseRoutes);
nestLmsAdminRoutes.route('/chapter', nestLmsAdminChapterRoutes);
nestLmsAdminRoutes.route('/quiz', nestLmsAdminQuizRoutes);
