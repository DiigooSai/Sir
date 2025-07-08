import { leaderboardHandler } from '@/controllers/nige-earn/leaderboard.controller';
import { requireEarnAuth } from '@/middlewares';
import { zQueryValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const leaderboardRouter = new Hono();

leaderboardRouter.get(
  '/',
  requireEarnAuth,
  zQueryValidator(
    z.object({
      monthly: z.coerce.boolean().optional(),
      month: z.coerce.number().int().min(0).max(11).optional(),
      year: z.coerce.number().int().min(1970).optional(),
    })
  ),
  leaderboardHandler
);
