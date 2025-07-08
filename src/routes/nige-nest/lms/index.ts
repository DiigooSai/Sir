import { Hono } from 'hono';
import { nestLmsUserRoutes } from './user';
import { nestLmsAdminRoutes } from './admin/index';

export const nestLmsRoutes = new Hono();

nestLmsRoutes.route('/admin', nestLmsAdminRoutes);
nestLmsRoutes.route('/user', nestLmsUserRoutes);
