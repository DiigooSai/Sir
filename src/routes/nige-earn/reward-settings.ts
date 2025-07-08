import { Hono } from 'hono';

import { requireEarnAuth } from '@/middlewares';
import { getRewardSettings } from '@/controllers/nige-admin/reward-settings.controller';

export const rewardSettingsRouter = new Hono();

/* SUPER_ADMIN or TREASURY only */
rewardSettingsRouter.get('/', requireEarnAuth, getRewardSettings);
