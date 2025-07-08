import { CONTEXT_STATE } from '@/constants/hono-context';
import { AssetLedgerModel, type IntentStatus } from '@/db/models/nige-nest/asset-ledger';
import { NestAccountModel } from '@/db/models/nige-nest/nest-account';
import {
  getExchangeAccount,
  getNestExchangeAccount,
  getNestPoolAccount,
  getNestTreasuryAccount,
  getPoolAccount,
  getTreasuryAccount,
} from '@/services/nige-earn/ledger';
import {
  approveSellGem,
  breakEggs,
  burnEggs,
  burnGems,
  buyEggs,
  convertGems,
  fundExchangeCoin,
  fundExchangeEgg,
  fundExchangeGem,
  fundPoolCoin,
  fundPoolEgg,
  fundPoolGem,
  mintEggs,
  mintGems,
  rejectSellGem,
  sellGemIntent,
  withdrawExchangeCoin,
  withdrawExchangeEgg,
  withdrawExchangeGem,
  withdrawPoolCoin,
  withdrawPoolEgg,
  withdrawPoolGem,
} from '@/services/nige-nest/asset-ledger';
import { listSellGemIntents } from '@/services/nige-nest/nest';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';
import { verifyTransactionOnChain } from '@/utils/verifyTransactionOnChain';
import { AccountModel, UserModel } from '@/db/models';

// Helper function to check wallet connection requirement
async function requireWalletConnection(accountId: string) {
  const user = await UserModel.findOne({ accountId });
  if (!user?.walletAddress || !user.isWalletVerified) {
    throw new Error('WALLET_REQUIRED');
  }
  return user;
}

export const getTotalAssets = async (c: Context) => {
  const [totals] = await NestAccountModel.aggregate([
    {
      $group: {
        _id: null,
        eggs: { $sum: '$eggs' },
        gems: { $sum: '$gems' },
      },
    },
  ]);

  const [totalCoinsData] = await AccountModel.aggregate([
    {
      $group: {
        _id: null,
        totalCoins: { $sum: '$balance' },
      },
    },
    { $project: { _id: 0, totalCoins: 1 } },
  ]);

  const eggs = totals?.eggs ?? 0;
  const gems = totals?.gems ?? 0;
  const coins = totalCoinsData?.totalCoins ?? 0;

  return c.json(new ApiResponse(200, { eggs, gems, coins }, 'Escrow details fetched successfully'));
};
export const getEscrowDetails = async (c: Context) => {
  const nestTreasuryAccount = await getNestTreasuryAccount();
  const nestExchangeAccount = await getNestExchangeAccount();
  const nestPoolAccount = await getNestPoolAccount();

  const treasuryAccount = await getTreasuryAccount();
  const exchangeAccount = await getExchangeAccount();
  const poolAccount = await getPoolAccount();

  const result = {
    nestTreasuryAccount,
    nestExchangeAccount,
    nestPoolAccount,
    baseAccounts: {
      treasuryAccount,
      exchangeAccount,
      poolAccount,
    },
  };
  return c.json(new ApiResponse(200, result, 'Escrow details fetched successfully'));
};
export async function mintEggsController(c: Context) {
  const { numEggs } = await c.req.json();
  const result = await mintEggs({ numEggs });
  return c.json(new ApiResponse(200, result, 'Eggs minted successfully'));
}
export async function mintGemsController(c: Context) {
  const { numGems } = await c.req.json();
  const result = await mintGems({ numGems });
  return c.json(new ApiResponse(200, result, 'Gems minted successfully'));
}

export async function burnEggsController(c: Context) {
  const { numEggs } = await c.req.json();
  const result = await burnEggs({ numEggs });
  return c.json(new ApiResponse(200, result, 'Eggs burned successfully'));
}

export async function burnGemsController(c: Context) {
  const { numGems } = await c.req.json();
  const result = await burnGems({ numGems });
  return c.json(new ApiResponse(200, result, 'Gems burned successfully'));
}

export async function fundExchangeEggsController(c: Context) {
  const { numEggs } = await c.req.json();
  const result = await fundExchangeEgg({ numEggs });
  return c.json(new ApiResponse(200, result, 'Eggs funded successfully'));
}

export async function fundExchangeGemsController(c: Context) {
  const { numGems } = await c.req.json();
  const result = await fundExchangeGem({ numGems });
  return c.json(new ApiResponse(200, result, 'Gems funded successfully'));
}

export async function fundExchangeCoinsController(c: Context) {
  const { numCoins } = await c.req.json();
  console.log('here coming');
  const result = await fundExchangeCoin({ numCoins });
  return c.json(new ApiResponse(200, result, 'Coins funded successfully'));
}

export async function fundPoolEggsController(c: Context) {
  const { numEggs } = await c.req.json();
  const result = await fundPoolEgg({ numEggs });
  return c.json(new ApiResponse(200, result, 'Eggs funded successfully'));
}

export async function fundPoolGemsController(c: Context) {
  const { numGems } = await c.req.json();
  const result = await fundPoolGem({ numGems });
  return c.json(new ApiResponse(200, result, 'Gems funded successfully'));
}

export async function fundPoolCoinsController(c: Context) {
  const { numCoins } = await c.req.json();
  const result = await fundPoolCoin({ numCoins });
  return c.json(new ApiResponse(200, result, 'Coins funded successfully'));
}

export async function withdrawExchangeEggsController(c: Context) {
  const { numEggs } = await c.req.json();
  const result = await withdrawExchangeEgg({ numEggs });
  return c.json(new ApiResponse(200, result, 'Eggs withdrawn successfully'));
}

export async function withdrawExchangeGemsController(c: Context) {
  const { numGems } = await c.req.json();
  const result = await withdrawExchangeGem({ numGems });
  return c.json(new ApiResponse(200, result, 'Gems withdrawn successfully'));
}

export async function withdrawExchangeCoinsController(c: Context) {
  const { numCoins } = await c.req.json();
  const result = await withdrawExchangeCoin({ numCoins });
  return c.json(new ApiResponse(200, result, 'Coins withdrawn successfully'));
}

export async function withdrawPoolEggsController(c: Context) {
  const { numEggs } = await c.req.json();
  const result = await withdrawPoolEgg({ numEggs });
  return c.json(new ApiResponse(200, result, 'Eggs withdrawn successfully'));
}

export async function withdrawPoolGemsController(c: Context) {
  const { numGems } = await c.req.json();
  const result = await withdrawPoolGem({ numGems });
  return c.json(new ApiResponse(200, result, 'Gems withdrawn successfully'));
}

export async function withdrawPoolCoinsController(c: Context) {
  const { numCoins } = await c.req.json();
  const result = await withdrawPoolCoin({ numCoins });
  return c.json(new ApiResponse(200, result, 'Coins withdrawn successfully'));
}

export async function breakEggsController(c: Context) {
  const { numEggsBreak } = await c.req.json();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const result = await breakEggs({ accountId, numEggsBreak });
  return c.json(new ApiResponse(200, result, 'Eggs broken successfully'));
}

export async function convertGemsController(c: Context) {
  const { amount } = await c.req.json();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const result = await convertGems({ accountId, amount });
  return c.json(new ApiResponse(200, result, 'Gems converted successfully'));
}

export async function buyEggsController(c: Context) {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Twitter authentication required' }, 401);
    }

    // Check wallet connection requirement
    try {
      await requireWalletConnection(accountId);
    } catch (error) {
      if ((error as Error).message === 'WALLET_REQUIRED') {
        return c.json({ 
          error: 'Wallet connection required', 
          message: 'Please connect your wallet first to make purchases',
          requiresWallet: true 
        }, 403);
      }
      throw error;
    }

    const { numEggs, meta } = await c.req.json();
    const { transactionHash, chain } = meta;
    // find a document in asset ledger with same transactionHash
    if (!transactionHash) {
      return c.json(new ApiResponse(400, { error: 'transactionHash is required' }, 'transactionHash is required'));
    }
    const assetLedger = await AssetLedgerModel.findOne({ transactionHash });
    // if found then reject
    if (!!assetLedger) {
      return c.json(new ApiResponse(400, { error: 'Transaction already exists' }, 'Transaction already exists'));
    }
    console.log('buyEggsController called with:', { numEggs, meta });

    const verifiedTx = await verifyTransactionOnChain({
      transactionHash,
      chain,
      numEggs,
    });

    if (!verifiedTx) {
      throw new Error('Transaction verification failed');
    }

    if (verifiedTx.status !== 1) {
      throw new Error('Transaction is not successful');
    }
    
    const result = await buyEggs({
      accountId,
      numEggs,
      transactionHash,
      meta: { transactionHash, chain },
    });

    return c.json(new ApiResponse(200, result, 'Eggs bought successfully'));
  } catch (err) {
    return c.json({ error: 'Transaction verification failed', message: (err as Error).message }, 500);
  }
}

export async function createSellGemIntentController(c: Context) {
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const { amount } = await c.req.json(); // -> need z json validators
  const result = await sellGemIntent({ accountId, amount });
  return c.json(new ApiResponse(200, result, 'Sell-gem intent created'), 200);
}

export async function approveSellGemIntentController(c: Context) {
  const { intentLedgerId, transactionHash } = await c.req.json(); // -> need z json validators
  const result = await approveSellGem({ intentLedgerId, transactionHash });
  return c.json(new ApiResponse(200, result, 'Sell-gem intent approved'), 200);
}

export async function rejectSellGemIntentController(c: Context) {
  const { intentLedgerId } = await c.req.json(); // -> need z json validators
  const result = await rejectSellGem({ intentLedgerId });
  return c.json(new ApiResponse(200, result, 'Sell-gem intent rejected'), 200);
}

export async function listSellGemIntentsController(c: Context) {
  // query param ?status=pending|approved|rejected
  const {
    statusParam,
  }: {
    statusParam?: IntentStatus;
  } = c.req.query(); // -> need z query validators
  const intents = await listSellGemIntents(statusParam);
  return c.json(new ApiResponse(200, intents, 'Sell-gem intents fetched'), 200);
}

// New controllers for transaction recovery
export async function recoverTransactionController(c: Context) {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Twitter authentication required' }, 401);
    }

    // Check wallet connection requirement
    try {
      await requireWalletConnection(accountId);
    } catch (error) {
      if ((error as Error).message === 'WALLET_REQUIRED') {
        return c.json({ 
          error: 'Wallet connection required', 
          message: 'Please connect your wallet first to recover transactions',
          requiresWallet: true 
        }, 403);
      }
      throw error;
    }

    const { transactionHash, chain, numEggs } = await c.req.json();

    // Check if transaction already exists in our ledger
    const existingLedger = await AssetLedgerModel.findOne({ transactionHash });
    if (existingLedger) {
      return c.json(new ApiResponse(400, { error: 'Transaction already processed' }, 'Transaction already exists'));
    }

    // Verify the transaction on chain
    const verifiedTx = await verifyTransactionOnChain({
      transactionHash,
      chain,
      numEggs,
    });

    if (!verifiedTx) {
      throw new Error('Transaction verification failed');
    }

    if (verifiedTx.status !== 1) {
      throw new Error('Transaction not successful');
    }

    // Process the recovery
    const result = await buyEggs({
      accountId,
      numEggs,
      transactionHash,
      meta: { transactionHash, chain },
    });

    return c.json(new ApiResponse(200, result, 'Transaction recovered successfully'));
  } catch (err) {
    return c.json({ error: 'Transaction recovery failed', message: (err as Error).message }, 500);
  }
}

export async function getPendingTransactionsController(c: Context) {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    
    // Import the transaction recovery service to get pending transactions
    const { TransactionRecoveryService } = await import('@/services/nige-nest/transaction-recovery.service');
    
    const pendingTransactions = await TransactionRecoveryService.getUserPendingTransactions(accountId);
    
    return c.json(new ApiResponse(200, pendingTransactions, 'Pending transactions fetched'));
  } catch (err) {
    return c.json({ error: 'Failed to fetch pending transactions', message: (err as Error).message }, 500);
  }
}

// Add prepare transaction controller for atomic flow
export async function prepareTransactionController(c: Context) {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Twitter authentication required' }, 401);
    }

    // Check wallet connection requirement
    try {
      await requireWalletConnection(accountId);
    } catch (error) {
      if ((error as Error).message === 'WALLET_REQUIRED') {
        return c.json({ 
          error: 'Wallet connection required', 
          message: 'Please connect your wallet first to make purchases',
          requiresWallet: true 
        }, 403);
      }
      throw error;
    }

    const { numEggs, estimatedAmount, chain } = await c.req.json();

    // Import the transaction recovery service here to avoid circular imports
    const { TransactionRecoveryService } = await import('@/services/nige-nest/transaction-recovery.service');
    
    // Create a temporary transaction hash for preparation
    const tempTxHash = `temp_${Date.now()}_${accountId}_${numEggs}`;
    
    // Create pending transaction record
    const pendingTx = await TransactionRecoveryService.createPendingTransaction({
      accountId,
      transactionHash: tempTxHash,
      chain,
      numEggs,
      amount: estimatedAmount,
      meta: { 
        prepared: true, 
        preparedAt: new Date(),
        temporary: true
      }
    });

    return c.json(new ApiResponse(200, {
      pendingTransactionId: pendingTx._id,
      tempTxHash,
      message: 'Transaction prepared - proceed with Web3 transaction'
    }, 'Transaction prepared successfully'));
  } catch (err) {
    return c.json({ 
      error: 'Failed to prepare transaction', 
      message: (err as Error).message 
    }, 500);
  }
}
