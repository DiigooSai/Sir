import { PendingTransactionModel } from '@/db/models/pending-transaction';
import { AssetLedgerModel } from '@/db/models/nige-nest/asset-ledger';
import { verifyTransactionOnChain } from '@/utils/verifyTransactionOnChain';
import { buyEggs } from './asset-ledger';

/**
 * Service to handle transaction recovery and background processing
 */
export class TransactionRecoveryService {
  
  /**
   * Create a pending transaction record when user initiates Web3 transaction
   */
  static async createPendingTransaction({
    accountId,
    transactionHash,
    chain,
    numEggs,
    amount,
    meta = {}
  }: {
    accountId: string;
    transactionHash: string;
    chain: 'bsc' | 'solana';
    numEggs: number;
    amount: number;
    meta?: Record<string, any>;
  }) {
    try {
      const pendingTx = new PendingTransactionModel({
        accountId,
        transactionHash,
        chain,
        numEggs,
        amount,
        status: 'pending',
        meta: { ...meta, createdAt: new Date() }
      });
      
      await pendingTx.save();
      return pendingTx;
    } catch (error) {
      if ((error as any).code === 11000) {
        // Duplicate transaction hash
        throw new Error('Transaction already exists');
      }
      throw error;
    }
  }

  /**
   * Process a single pending transaction
   */
  static async processPendingTransaction(transactionHash: string) {
    const pendingTx = await PendingTransactionModel.findOne({ 
      transactionHash,
      status: { $in: ['pending', 'failed'] }
    });

    if (!pendingTx) {
      throw new Error('Pending transaction not found');
    }

    // Mark as processing
    pendingTx.status = 'processing';
    pendingTx.attempts += 1;
    pendingTx.lastAttemptAt = new Date();
    await pendingTx.save();

    try {
      // Check if already processed in asset ledger
      const existingLedger = await AssetLedgerModel.findOne({ 
        transactionHash: pendingTx.transactionHash 
      });
      
      if (existingLedger) {
        // Already processed, mark as completed
        pendingTx.status = 'completed';
        pendingTx.completedAt = new Date();
        await pendingTx.save();
        return { success: true, message: 'Transaction already processed' };
      }

      // Verify transaction on chain
      const verifiedTx = await verifyTransactionOnChain({
        transactionHash: pendingTx.transactionHash,
        chain: pendingTx.chain,
        numEggs: pendingTx.numEggs,
      });

      if (!verifiedTx || verifiedTx.status !== 1) {
        throw new Error('Transaction verification failed');
      }

      // Process the purchase
      const result = await buyEggs({
        accountId: pendingTx.accountId.toString(),
        numEggs: pendingTx.numEggs,
        transactionHash: pendingTx.transactionHash,
        meta: { 
          ...pendingTx.meta, 
          processedAt: new Date(),
          recoveredFromPending: true 
        },
      });

      // Mark as completed
      pendingTx.status = 'completed';
      pendingTx.completedAt = new Date();
      await pendingTx.save();

      return { success: true, result };

    } catch (error) {
      // Mark as failed if too many attempts
      const maxAttempts = 5;
      if (pendingTx.attempts >= maxAttempts) {
        pendingTx.status = 'failed';
        pendingTx.errorMessage = (error as Error).message;
      } else {
        pendingTx.status = 'pending'; // Will retry later
        pendingTx.errorMessage = (error as Error).message;
      }
      await pendingTx.save();
      
      throw error;
    }
  }

  /**
   * Get pending transactions for a user
   */
  static async getUserPendingTransactions(accountId: string) {
    return await PendingTransactionModel.find({
      accountId,
      status: { $in: ['pending', 'processing', 'failed'] }
    }).sort({ createdAt: -1 });
  }

  /**
   * Background job to process all pending transactions
   */
  static async processAllPendingTransactions() {
    const pendingTxs = await PendingTransactionModel.find({
      status: 'pending',
      attempts: { $lt: 5 }
    }).limit(50); // Process in batches

    const results = [];
    for (const tx of pendingTxs) {
      try {
        const result = await this.processPendingTransaction(tx.transactionHash);
        results.push({ transactionHash: tx.transactionHash, success: true, result });
      } catch (error) {
        results.push({ 
          transactionHash: tx.transactionHash, 
          success: false, 
          error: (error as Error).message 
        });
      }
    }

    return results;
  }

  /**
   * Retry failed transactions that haven't exceeded max attempts
   */
  static async retryFailedTransactions() {
    const failedTxs = await PendingTransactionModel.find({
      status: 'failed',
      attempts: { $lt: 5 },
      lastAttemptAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
    }).limit(20);

    for (const tx of failedTxs) {
      try {
        await this.processPendingTransaction(tx.transactionHash);
      } catch (error) {
        console.error(`Failed to retry transaction ${tx.transactionHash}:`, error);
      }
    }
  }
} 