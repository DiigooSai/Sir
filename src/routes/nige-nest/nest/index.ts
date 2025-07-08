import {
  archiveNestController,
  createNestController,
  editNestController,
  endNestController,
  getAllAdminNestsController,
  getAllUserNestsController,
  getMyInNestEntriesController,
  getMyNestAccountDetailsController,
  getMyNestsController,
  getNestByIdController,
  getAllNestIssuesController,
  getSpecificUserNestsController,
  inNestController,
  launchNestController,
  nestCooldownController,
  unlockNestController,
  updateMyNestProfileController,
  nestGiveAwayController,
  clearMyNestProfileController,
  getAllTransactionIssuesController,
  resolveTransactionIssueController,
  getUserLedgerAllController,
  getUserLedgerMarketPlaceController,
  getUserLedgerBuyConvertController,
  getMyNestSignUpBonusController,
} from '@/controllers/nest-nest/nest.controller';
import { mongoIdZod, PaginationSchema, zodIdSchema } from '@/db/common-schemas';
import { createGiveAwaySchema } from '@/db/models/nige-nest/asset-ledger';
import { createInNestEntryZodSchema } from '@/db/models/nige-nest/in-nest-entry';
import { createNestZodSchema, EditNestZodSchema } from '@/db/models/nige-nest/nest';
import { requireNestUserAuth, requireSuperAdminAuth } from '@/middlewares';
import { UpdateMyNestProfileInput } from '@/services/nige-nest/nest';
import { zJsonValidator, zParamsValidator, zQueryValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';
import { influencerRoutes } from './influencers';
import { promoCodeRoutes } from './promo-codes';

export const nigeNestNestRoutes = new Hono();

nigeNestNestRoutes.get('/me', requireNestUserAuth, getMyNestAccountDetailsController);
nigeNestNestRoutes.patch('/me', requireNestUserAuth, zJsonValidator(UpdateMyNestProfileInput), updateMyNestProfileController);
nigeNestNestRoutes.get('/sign-up-bonus', requireNestUserAuth, getMyNestSignUpBonusController);
nigeNestNestRoutes.patch('/clear-me', requireNestUserAuth, zJsonValidator(z.object({})), clearMyNestProfileController);
nigeNestNestRoutes.get('/nestIssues', requireSuperAdminAuth, getAllNestIssuesController);
nigeNestNestRoutes.get('/transaction-issues', requireSuperAdminAuth, getAllTransactionIssuesController);
nigeNestNestRoutes.post(
  '/resolve-transaction-issue',
  requireSuperAdminAuth,
  zJsonValidator(
    z
      .object({
        issueId: mongoIdZod,
      })
      .strict()
  ),
  resolveTransactionIssueController
);
nigeNestNestRoutes.post('/giveaway', requireSuperAdminAuth, zJsonValidator(createGiveAwaySchema), nestGiveAwayController);
// get all the nest in which user have in nested
nigeNestNestRoutes.get('/user-ledgers/all', requireNestUserAuth, zQueryValidator(PaginationSchema), getUserLedgerAllController);
nigeNestNestRoutes.get('/user-ledgers/marketplace', requireNestUserAuth, zQueryValidator(PaginationSchema), getUserLedgerMarketPlaceController);
nigeNestNestRoutes.get('/user-ledgers/buy-convert', requireNestUserAuth, zQueryValidator(PaginationSchema), getUserLedgerBuyConvertController);
nigeNestNestRoutes.get('/myNests', requireNestUserAuth, getMyNestsController);
nigeNestNestRoutes.get('/:nestId', requireNestUserAuth, zParamsValidator(z.object({ nestId: mongoIdZod })), getNestByIdController);
nigeNestNestRoutes.post('/', requireSuperAdminAuth, zJsonValidator(createNestZodSchema), createNestController);
nigeNestNestRoutes.patch('/', requireSuperAdminAuth, zJsonValidator(EditNestZodSchema), editNestController);
nigeNestNestRoutes.delete('/', requireSuperAdminAuth, zJsonValidator(z.object({ nestId: mongoIdZod })), archiveNestController);
nigeNestNestRoutes.post('/launch', requireSuperAdminAuth, zJsonValidator(z.object({ nestId: mongoIdZod })), launchNestController);
nigeNestNestRoutes.post('/end', requireSuperAdminAuth, zJsonValidator(z.object({ nestId: mongoIdZod })), endNestController);
nigeNestNestRoutes.post('/cooldown', requireSuperAdminAuth, zJsonValidator(z.object({ nestId: mongoIdZod })), nestCooldownController);

// superAdmin: get all nests
nigeNestNestRoutes.get('/admin/all', requireSuperAdminAuth, getAllAdminNestsController);
nigeNestNestRoutes.get('/user/all', requireNestUserAuth, getAllUserNestsController);

// nigeNestNestRoutes.get('/admin/:_id', requireSuperAdminAuth);
nigeNestNestRoutes.get('/user/:_id', requireNestUserAuth, zParamsValidator(zodIdSchema), getSpecificUserNestsController);
nigeNestNestRoutes.post('/unlock', requireNestUserAuth, zJsonValidator(z.object({ nestId: mongoIdZod })), unlockNestController);
nigeNestNestRoutes.post(
  '/inNest/:_id',
  requireNestUserAuth,
  zParamsValidator(zodIdSchema),
  zJsonValidator(createInNestEntryZodSchema),
  inNestController
);

nigeNestNestRoutes.get(
  '/myOrders/:nestId',
  requireNestUserAuth,
  zParamsValidator(
    z.object({
      nestId: mongoIdZod.optional(),
    })
  ),
  getMyInNestEntriesController
);

// end nest controller
nigeNestNestRoutes.post('/end-nest/:_id', requireSuperAdminAuth, endNestController);
nigeNestNestRoutes.post('/cooldown/:_id', requireSuperAdminAuth, nestCooldownController);

// influencers and promo codes
nigeNestNestRoutes.route('/influencers', influencerRoutes);
nigeNestNestRoutes.route('/promo-codes', promoCodeRoutes);
