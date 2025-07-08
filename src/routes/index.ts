import { ApiResponse } from '@/utils/ApiResponse';
import { Hono } from 'hono';
import { authRoutes } from './auth';
import { nigeEarnRoutes } from './nige-earn';
import { nigeLinkRoutes } from './nige-link';
import { nigeAdminRoutes } from './nige-admin';
import { nigeNestRoutes } from './nige-nest';
import { utilsRouter } from '@/utils/asset-management/urls';
import { assetRouter } from './asset';

const app = new Hono();

export const routes = app
  .get('/health-check', (c) => {
    console.log('health check');
    return c.json(
      new ApiResponse(200, {
        status: 'api working, live and kicking!',
      })
    );
  })
  .route('/auth', authRoutes)
  .route('/utils', utilsRouter)
  .route('/asset', assetRouter)
  .route('/nige-nest', nigeNestRoutes)
  .route('/nige-earn', nigeEarnRoutes)
  .route('/nige-link', nigeLinkRoutes)
  .route('/nige-admin', nigeAdminRoutes);

export type AppType = typeof routes;
