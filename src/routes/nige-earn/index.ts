import { Hono } from 'hono';
import { ApiResponse } from '@/utils/ApiResponse';
import { rewardSettingsRouter } from './reward-settings';
import { leaderboardRouter } from './leaderboard';
import { activityRouter } from './activity';
import { requireAuth } from '@/middlewares';

export const nigeEarnRoutes = new Hono();

nigeEarnRoutes
  .get('/ping', requireAuth, (c) => c.json(new ApiResponse(200, { status: 'nige-earn alive' })))
  .route('/reward-settings', rewardSettingsRouter)
  .route('/leaderboard', leaderboardRouter)
  .route('/activities', activityRouter);
