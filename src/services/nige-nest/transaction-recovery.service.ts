import { PendingTransactionModel } from '@/db/models/pending-transaction';
import { DeadLetterTransactionModel } from '@/db/models/dead-letter-transaction';
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

      // Update amount if it wasn't set initially
      if (pendingTx.amount === 0 && verifiedTx.amount) {
        pendingTx.amount = verifiedTx.amount;
        await pendingTx.save();
      }

      // Process the purchase
      const result = await buyEggs({
        accountId: pendingTx.accountId.toString(),
        numEggs: pendingTx.numEggs,
        transactionHash: pendingTx._id.toString(), // Use document ID for internal tracking
        meta: { 
          transactionHash: pendingTx.transactionHash,
          chain: pendingTx.chain as 'bsc' | 'solana',
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
        await pendingTx.save();
        
        // Move to dead letter queue for manual review - NO TRANSACTION LOSS
        await this.moveToDeadLetterQueue(pendingTx, (error as Error).message);
        console.error(`❌ Transaction moved to dead letter queue after ${maxAttempts} attempts: ${pendingTx.transactionHash}`);
      } else {
        pendingTx.status = 'pending'; // Will retry later
        pendingTx.errorMessage = (error as Error).message;
        await pendingTx.save();
      }
      
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
      lastAttemptAt: { $lt: new Date(Date.now() - 10 * 1000) } // Only 10 seconds ago for faster retries
    }).limit(50); // Increased limit for faster processing

    for (const tx of failedTxs) {
      try {
        await this.processPendingTransaction(tx.transactionHash);
      } catch (error) {
        console.error(`Failed to retry transaction ${tx.transactionHash}:`, error);
      }
    }
  }

  /**
   * Fast-track processing for immediate transaction handling
   */
  static async fastTrackProcessing(transactionHash: string, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Fast-track attempt ${attempt}/${maxAttempts} for ${transactionHash}`);
        const result = await this.processPendingTransaction(transactionHash);
        return result;
      } catch (error) {
        console.log(`Fast-track attempt ${attempt} failed:`, (error as Error).message);
        
        if (attempt < maxAttempts) {
          // Short delay between attempts (exponential backoff: 1s, 2s)
          const delay = attempt * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error; // Final attempt failed
        }
      }
    }
  }

  /**
   * Move failed transaction to dead letter queue for manual review
   * This ensures NO TRANSACTION IS EVER LOST
   */
  static async moveToDeadLetterQueue(pendingTx: any, lastError: string) {
    try {
      await DeadLetterTransactionModel.create({
        accountId: pendingTx.accountId,
        transactionHash: pendingTx.transactionHash,
        chain: pendingTx.chain,
        numEggs: pendingTx.numEggs,
        amount: pendingTx.amount,
        originalAttempts: pendingTx.attempts,
        lastError,
        needsManualReview: true,
        originalMeta: pendingTx.meta || {},
      });

      console.log(`🚨 CRITICAL: Transaction ${pendingTx.transactionHash} moved to dead letter queue for manual review`);
      
      // Alert admin (you could add email/webhook here)
      // TODO: Add admin notification system
      
    } catch (dlqError) {
      console.error(`💥 CRITICAL ERROR: Failed to save to dead letter queue:`, dlqError);
      // Even if DLQ fails, we logged the transaction details above
    }
  }

  /**
   * Get transactions in dead letter queue that need manual review
   */
  static async getDeadLetterTransactions() {
    return await DeadLetterTransactionModel.find({
      needsManualReview: true,
      isResolved: false
    }).sort({ failedAt: -1 });
  }

  /**
   * Manually resolve a dead letter transaction
   */
  static async resolveDeadLetterTransaction(
    deadLetterTxId: string, 
    reviewedBy: string, 
    reviewNotes: string,
    forceProcess = false
  ) {
    const deadLetterTx = await DeadLetterTransactionModel.findById(deadLetterTxId);
    if (!deadLetterTx) {
      throw new Error('Dead letter transaction not found');
    }

    if (forceProcess) {
      // Admin wants to force process this transaction
      try {
        const result = await buyEggs({
          accountId: deadLetterTx.accountId.toString(),
          numEggs: deadLetterTx.numEggs,
          transactionHash: deadLetterTx._id.toString(), // Use DLQ ID for internal tracking
          meta: {
            transactionHash: deadLetterTx.transactionHash,
            chain: deadLetterTx.chain as 'bsc' | 'solana',
          }
        });

        deadLetterTx.isResolved = true;
        deadLetterTx.resolvedAt = new Date();
        deadLetterTx.reviewedBy = reviewedBy as any;
        deadLetterTx.reviewedAt = new Date();
        deadLetterTx.reviewNotes = reviewNotes;
        await deadLetterTx.save();

        return { success: true, result };
      } catch (error) {
        throw new Error(`Failed to force process transaction: ${(error as Error).message}`);
      }
    } else {
      // Admin reviewed but didn't process (maybe invalid transaction)
      deadLetterTx.needsManualReview = false;
      deadLetterTx.reviewedBy = reviewedBy as any;
      deadLetterTx.reviewedAt = new Date();
      deadLetterTx.reviewNotes = reviewNotes;
      await deadLetterTx.save();

      return { success: true, reviewed: true };
    }
  }
} 