import { Hono } from 'hono';
import { z } from 'zod';

import { adminCheck, adminLogout } from '@/controllers/auth/admin.controller';
import { mintCoins, burnCoins, getTreasuryAccount } from '@/controllers/nige-admin/treasury.controller';
import { getRewardSettings, rewardAdminPatchZ, updateRewardSettings } from '@/controllers/nige-admin/reward-settings.controller';
import {
  addMentionHandler,
  getMentionHandler,
  mentionZ,
  patchMentionZ,
  removeMentionHandler,
  updateMentionHandler,
} from '@/controllers/nige-admin/mentions.controller';
import {
  addHashtagHandler,
  getHashtagHandler,
  hashtagZ,
  patchHashtagZ,
  removeHashtagHandler,
  updateHashtagHandler,
} from '@/controllers/nige-admin/hashtags.controller';
import { getLedgerHistory } from '@/controllers/nige-admin/ledger.controller';
import { rewardStatsHandler } from '@/controllers/nige-admin/reward-stats.controller'; // ← NEW

import { requireAdminAuth } from '@/middlewares';
import { authorize } from '@/middlewares/authorize';
import { PERMISSIONS } from '@/constants';
import { zJsonValidator, zParamsValidator, zQueryValidator } from '@/utils/zValidators';
import { LedgerQuerySchema } from '@/db/models';
import { userManagementRoutes } from './user-management';
import { roleRoles } from './role';

/* ─────────────────────────────────────────────────────────────────── */

export const nigeAdminRoutes = new Hono();

/* ─── AUTH ───────────────────────────── */
nigeAdminRoutes.get('/auth/check', requireAdminAuth, adminCheck);
nigeAdminRoutes.post('/auth/logout', requireAdminAuth, adminLogout);

/* ─── TREASURY ───────────────────────── */
nigeAdminRoutes.post(
  '/mint',
  requireAdminAuth,
  authorize(PERMISSIONS.LEDGER_MINT),
  zJsonValidator(z.object({ amount: z.number().positive() })),
  mintCoins
);

nigeAdminRoutes.post(
  '/burn',
  requireAdminAuth,
  authorize(PERMISSIONS.LEDGER_BURN),
  zJsonValidator(z.object({ amount: z.number().positive() })),
  burnCoins
);

nigeAdminRoutes.get('/treasury', requireAdminAuth, authorize(PERMISSIONS.LEDGER_ADMIN_XFER), getTreasuryAccount);

/* ─── LEDGER ─────────────────────────── */
nigeAdminRoutes.get('/ledger', requireAdminAuth, authorize(PERMISSIONS.LEDGER_HISTORY), zQueryValidator(LedgerQuerySchema), getLedgerHistory);

/* NEW: aggregated reward stats */
nigeAdminRoutes.get('/ledger/rewards-summary', requireAdminAuth, authorize(PERMISSIONS.LEDGER_HISTORY), rewardStatsHandler);

/* ─── REWARD SETTINGS ────────────────── */
const rewardSettingsRouter = new Hono();

rewardSettingsRouter
  .get('/', requireAdminAuth, authorize(PERMISSIONS.REWARD_SETTINGS), getRewardSettings)
  .patch('/', requireAdminAuth, authorize(PERMISSIONS.REWARD_SETTINGS), zJsonValidator(rewardAdminPatchZ), updateRewardSettings);

nigeAdminRoutes.route('/reward-settings', rewardSettingsRouter);

/* ─── MENTIONS ───────────────────────── */
const mentionsRouter = new Hono();

mentionsRouter
  .get('/:tag', requireAdminAuth, authorize(PERMISSIONS.REWARD_SETTINGS), getMentionHandler)
  .post('/', requireAdminAuth, authorize(PERMISSIONS.REWARD_SETTINGS), zJsonValidator(mentionZ), addMentionHandler)
  .patch(
    '/:tag',
    requireAdminAuth,
    authorize(PERMISSIONS.REWARD_SETTINGS),
    zParamsValidator(z.object({ tag: z.string().min(1) })),
    zJsonValidator(patchMentionZ),
    updateMentionHandler
  )
  .delete(
    '/:tag',
    requireAdminAuth,
    authorize(PERMISSIONS.REWARD_SETTINGS),
    zParamsValidator(z.object({ tag: z.string().min(1) })),
    removeMentionHandler
  );

nigeAdminRoutes.route('/reward-settings/mentions', mentionsRouter);

/* ─── HASHTAGS ───────────────────────── */
const hashtagsRouter = new Hono();

hashtagsRouter
  .get('/:tag', requireAdminAuth, authorize(PERMISSIONS.REWARD_SETTINGS), getHashtagHandler)
  .post('/', requireAdminAuth, authorize(PERMISSIONS.REWARD_SETTINGS), zJsonValidator(hashtagZ), addHashtagHandler)
  .patch(
    '/:tag',
    requireAdminAuth,
    authorize(PERMISSIONS.REWARD_SETTINGS),
    zParamsValidator(z.object({ tag: z.string().min(1) })),
    zJsonValidator(patchHashtagZ),
    updateHashtagHandler
  )
  .delete(
    '/:tag',
    requireAdminAuth,
    authorize(PERMISSIONS.REWARD_SETTINGS),
    zParamsValidator(z.object({ tag: z.string().min(1) })),
    removeHashtagHandler
  );

nigeAdminRoutes.route('/reward-settings/hashtags', hashtagsRouter);

nigeAdminRoutes.route('/user-management', userManagementRoutes);

nigeAdminRoutes.route('/roles', roleRoles);
