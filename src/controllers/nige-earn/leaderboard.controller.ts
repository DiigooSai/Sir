import type { Context } from 'hono';
import { ApiResponse } from '@/utils/ApiResponse';
import { getLeaderboard } from '@/services/nige-earn/leaderboard';
import { CONTEXT_STATE } from '@/constants/hono-context';

export async function leaderboardHandler(c: Context) {
  const accountId = c.get(CONTEXT_STATE.JWT_PAYLOAD).accountId as string;
  const {
    monthly = true,
    month: qMonth,
    year: qYear,
  } = c.req.query as {
    monthly?: boolean;
    month?: number;
    year?: number;
  };

  const leaderboard = await getLeaderboard(accountId, {
    monthly,
    month: qMonth,
    year: qYear,
  });

  const now = new Date();
  const resp = {
    isMonthly: Boolean(monthly || (qMonth != null && qYear != null)),
    month: qMonth != null ? qMonth : now.getUTCMonth(),
    year: qYear != null ? qYear : now.getUTCFullYear(),
    leaderboard,
  };
  return c.json(new ApiResponse(200, resp));
}
