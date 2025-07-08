import { z } from 'zod';
import type { Context } from 'hono';
import { runInTransaction } from '@/utils/transaction-helper';
import { ApiResponse } from '@/utils/ApiResponse';
import { fetchSettings, patchSettings } from '@/services/nige-earn/reward-settings';

// ─── Now allows an empty object too ───────────────────────────────────────────────
export const rewardAdminPatchZ = z.object({
  likeReward: z.number().positive().optional(),
  quoteTweetReward: z.number().positive().optional(),
  repostReward: z.number().positive().optional(),
  replyReward: z.number().positive().optional(),
});

export async function updateRewardSettings(c: Context) {
  const dto = c.req.valid('json') as z.infer<typeof rewardAdminPatchZ>;

  const updated = await runInTransaction(async (session) => {
    return patchSettings(dto, session);
  });

  return c.json(new ApiResponse(200, updated, 'Reward settings updated'));
}

export async function getRewardSettings(c: Context) {
  const doc = await fetchSettings();
  return c.json(new ApiResponse(200, doc));
}
