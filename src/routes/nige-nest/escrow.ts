import {
  approveSellGemIntentController,
  breakEggsController,
  burnEggsController,
  burnGemsController,
  buyEggsController,
  convertGemsController,
  createSellGemIntentController,
  fundExchangeCoinsController,
  fundExchangeEggsController,
  fundExchangeGemsController,
  fundPoolCoinsController,
  fundPoolEggsController,
  fundPoolGemsController,
  getEscrowDetails,
  getTotalAssets,
  listSellGemIntentsController,
  mintEggsController,
  mintGemsController,
  rejectSellGemIntentController,
  withdrawExchangeCoinsController,
  withdrawExchangeEggsController,
  withdrawExchangeGemsController,
  withdrawPoolCoinsController,
  withdrawPoolEggsController,
  withdrawPoolGemsController,
  recoverTransactionController,
  getPendingTransactionsController,
  prepareTransactionController,
} from '@/controllers/nest-nest/escrow.controller';
import { zIntentStatus } from '@/db/models/nige-nest/asset-ledger';
import { requireNestUserAuth, requireSuperAdminAuth } from '@/middlewares';
import { ApproveSellGemInput, BreakEggsInput, BuyEggsInput, ConvertGemsInput, RejectSellGemInput } from '@/services/nige-nest/asset-ledger';
import { zJsonValidator, zQueryValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const nigeNestEscrowRoutes = new Hono();

const eggsTransferSchema = z.object({ numEggs: z.number().int().positive() });
const gemTransferSchema = z.object({ numGems: z.number().positive() });
const coinTransferSchema = z.object({ numCoins: z.number().int().positive() });

// superAdmin
nigeNestEscrowRoutes.get('/total-assets', requireSuperAdminAuth, getTotalAssets);
nigeNestEscrowRoutes.get('/escrow-details', requireSuperAdminAuth, getEscrowDetails);
nigeNestEscrowRoutes.get(
  '/sell-gem-intent-orders',
  requireSuperAdminAuth,
  zQueryValidator(
    z.object({
      status: zIntentStatus.optional(),
    })
  ),
  listSellGemIntentsController
);

nigeNestEscrowRoutes.post('/mint-eggs', requireSuperAdminAuth, zJsonValidator(eggsTransferSchema), mintEggsController);
nigeNestEscrowRoutes.post('/burn-eggs', requireSuperAdminAuth, zJsonValidator(eggsTransferSchema), burnEggsController);
nigeNestEscrowRoutes.post('/mint-gems', requireSuperAdminAuth, zJsonValidator(gemTransferSchema), mintGemsController);
nigeNestEscrowRoutes.post('/burn-gems', requireSuperAdminAuth, zJsonValidator(gemTransferSchema), burnGemsController);

nigeNestEscrowRoutes.post('/fund-exchange-eggs', requireSuperAdminAuth, zJsonValidator(eggsTransferSchema), fundExchangeEggsController);
nigeNestEscrowRoutes.post('/fund-exchange-gems', requireSuperAdminAuth, zJsonValidator(gemTransferSchema), fundExchangeGemsController);
nigeNestEscrowRoutes.post('/fund-exchange-coins', requireSuperAdminAuth, zJsonValidator(coinTransferSchema), fundExchangeCoinsController);

nigeNestEscrowRoutes.post('/fund-pool-eggs', requireSuperAdminAuth, zJsonValidator(eggsTransferSchema), fundPoolEggsController);
nigeNestEscrowRoutes.post('/fund-pool-gems', requireSuperAdminAuth, zJsonValidator(gemTransferSchema), fundPoolGemsController);
nigeNestEscrowRoutes.post('/fund-pool-coins', requireSuperAdminAuth, zJsonValidator(coinTransferSchema), fundPoolCoinsController);

nigeNestEscrowRoutes.post('/withdraw-exchange-eggs', requireSuperAdminAuth, zJsonValidator(eggsTransferSchema), withdrawExchangeEggsController);
nigeNestEscrowRoutes.post('/withdraw-exchange-gems', requireSuperAdminAuth, zJsonValidator(gemTransferSchema), withdrawExchangeGemsController);
nigeNestEscrowRoutes.post('/withdraw-exchange-coins', requireSuperAdminAuth, zJsonValidator(coinTransferSchema), withdrawExchangeCoinsController);

nigeNestEscrowRoutes.post('/withdraw-pool-eggs', requireSuperAdminAuth, zJsonValidator(eggsTransferSchema), withdrawPoolEggsController);
nigeNestEscrowRoutes.post('/withdraw-pool-gems', requireSuperAdminAuth, zJsonValidator(gemTransferSchema), withdrawPoolGemsController);
nigeNestEscrowRoutes.post('/withdraw-pool-coins', requireSuperAdminAuth, zJsonValidator(coinTransferSchema), withdrawPoolCoinsController);

nigeNestEscrowRoutes.post('/approve-sell-gems-intent', requireSuperAdminAuth, zJsonValidator(ApproveSellGemInput), approveSellGemIntentController);
nigeNestEscrowRoutes.post('/reject-sell-gems-intent', requireSuperAdminAuth, zJsonValidator(RejectSellGemInput), rejectSellGemIntentController);

// user
nigeNestEscrowRoutes.post(
  '/break-eggs',
  requireNestUserAuth,
  zJsonValidator(
    BreakEggsInput.pick({
      numEggsBreak: true,
    })
  ),
  breakEggsController
);
nigeNestEscrowRoutes.post(
  '/convert-gems',
  requireNestUserAuth,
  zJsonValidator(
    ConvertGemsInput.pick({
      amount: true,
    })
  ),
  convertGemsController
);

nigeNestEscrowRoutes.post(
  '/buy-eggs',
  requireNestUserAuth,
  zJsonValidator(
  BuyEggsInput.pick({
  numEggs: true,
  meta: true
  })
  ),
  buyEggsController
);

nigeNestEscrowRoutes.post(
  '/create-sell-gems-intent',
  requireNestUserAuth,
  zJsonValidator(
    z.object({
      amount: z.number().positive(),
    })
  ),
  createSellGemIntentController
);

// Add transaction recovery endpoint
nigeNestEscrowRoutes.post(
  '/recover-transaction',
  requireNestUserAuth,
  zJsonValidator(
    z.object({
      transactionHash: z.string().min(1),
      chain: z.enum(['bsc', 'solana']),
      numEggs: z.number().int().positive()
    })
  ),
  recoverTransactionController
);

// Add pending transactions check endpoint  
nigeNestEscrowRoutes.get(
  '/pending-transactions',
  requireNestUserAuth,
  getPendingTransactionsController
);

// Add transaction preparation endpoint for atomic flow
nigeNestEscrowRoutes.post(
  '/transaction/prepare',
  requireNestUserAuth,
  zJsonValidator(
    z.object({
      numEggs: z.number().int().positive(),
      estimatedAmount: z.number().positive(),
      chain: z.enum(['bsc', 'solana'])
    })
  ),
  prepareTransactionController
);
