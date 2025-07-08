import { Hono } from 'hono';
import { nigeLinkProjectsRouter } from './nige-link-project';

export const nigeLinkRoutes = new Hono();

nigeLinkRoutes.route('/projects', nigeLinkProjectsRouter);
