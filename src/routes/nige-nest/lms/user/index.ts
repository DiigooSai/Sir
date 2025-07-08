import { Hono } from 'hono';
import { nestLmsUserCourseRoutes } from './course';
import { nestLmsUserChapterRoutes } from './chapter';
import { nestLmsUserQuizRoutes } from './quiz';

export const nestLmsUserRoutes = new Hono();

nestLmsUserRoutes.route('/course', nestLmsUserCourseRoutes);
nestLmsUserRoutes.route('/chapter', nestLmsUserChapterRoutes);
nestLmsUserRoutes.route('/quiz', nestLmsUserQuizRoutes);
