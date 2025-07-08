// src/controllers/nige-admin/reward-stats.controller.ts
import type { Context } from 'hono';
import { ApiResponse } from '@/utils/ApiResponse';
import { getRewardStats } from '@/services/nige-earn/reward-stats';

/** GET /nige-admin/ledger/rewards-summary */
export async function rewardStatsHandler(c: Context) {
  const stats = await getRewardStats();
  return c.json(new ApiResponse(200, stats));
}
