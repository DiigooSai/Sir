import { z } from 'zod';
import type { Context } from 'hono';
import { runInTransaction } from '@/utils/transaction-helper';
import { ApiResponse } from '@/utils/ApiResponse';
import { fetchSettings, patchSettings } from '@/services/nige-earn/reward-settings';

/* Zod schema: each field optional */
const rewardSettingsPatchZ = z.object({
  maxMainPosts: z.number().int().positive().optional(),
  likeReward: z.number().positive().optional(),
  bookmarkReward: z.number().positive().optional(),
  quoteTweetReward: z.number().positive().optional(),
  repostReward: z.number().positive().optional(),
  replyReward: z.number().positive().optional(),
  replyLimit: z.number().int().positive().optional(),
  maxThreads: z.number().int().positive().optional(),
  mentions: z.array(z.object({ tag: z.string(), reward: z.number().positive() })).optional(),
  hashtags: z.array(z.object({ tag: z.string(), reward: z.number().positive() })).optional(),
  cashtags: z.array(z.object({ tag: z.string(), reward: z.number().positive() })).optional(),
  dailyLimit: z.number().int().positive().optional(),
  followReward: z.number().positive().optional(),
  notificationReward: z.number().positive().optional(),
  rewardStartDate: z.coerce.date().nullable().optional(),
  whitelistedTweetIds: z.array(z.string()).optional(),
});

export async function getSettings(c: Context) {
  const doc = await fetchSettings();
  return c.json(new ApiResponse(200, doc));
}

export async function updateSettings(c: Context) {
  const payload = await c.req.json();
  const dto = rewardSettingsPatchZ.parse(payload);

  // start a transaction here and pass session into the service
  const updated = await runInTransaction(async (session) => {
    return patchSettings(dto, session);
  });

  return c.json(new ApiResponse(200, updated, 'settings updated'));
}
