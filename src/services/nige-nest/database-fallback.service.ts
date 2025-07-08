import { PendingTransactionModel } from '@/db/models/pending-transaction';
import { TransactionRecoveryService } from './transaction-recovery.service';

/**
 * Database-only fallback processing when Redis/BullMQ is down
 * Ensures transaction processing continues even if queue system fails
 */
export class DatabaseFallbackService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start database fallback processing
   * Only runs if Redis/BullMQ is unavailable
   */
  static async startFallbackProcessing() {
    if (this.isRunning) {
      console.log('Database fallback already running');
      return;
    }

    this.isRunning = true;
    console.log('🆘 Starting database fallback processing (Redis/BullMQ unavailable)');

    // Process pending transactions every 5 seconds using database polling
    this.intervalId = setInterval(async () => {
      try {
        await this.processPendingTransactionsFromDB();
      } catch (error) {
        console.error('Database fallback processing error:', error);
      }
    }, 5000); // 5 seconds - slightly slower than Redis but still fast
  }

  /**
   * Stop database fallback processing
   */
  static stopFallbackProcessing() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('✅ Database fallback processing stopped');
  }

  /**
   * Process pending transactions directly from database
   */
  static async processPendingTransactionsFromDB() {
    try {
      // Get pending transactions that need processing
      const pendingTxs = await PendingTransactionModel.find({
        status: { $in: ['pending'] },
        attempts: { $lt: 5 },
        $or: [
          { lastAttemptAt: { $exists: false } },
          { lastAttemptAt: { $lt: new Date(Date.now() - 10 * 1000) } } // 10 seconds ago
        ]
      })
      .limit(10) // Process in small batches to avoid overwhelming
      .sort({ createdAt: 1 }); // FIFO processing

      console.log(`📊 Database fallback processing ${pendingTxs.length} transactions`);

      for (const tx of pendingTxs) {
        try {
          await TransactionRecoveryService.processPendingTransaction(tx.transactionHash);
          console.log(`✅ Database fallback processed: ${tx.transactionHash}`);
        } catch (error) {
          console.log(`❌ Database fallback failed: ${tx.transactionHash}:`, (error as Error).message);
        }
      }

      // Also retry failed transactions
      await this.retryFailedTransactionsFromDB();

    } catch (error) {
      console.error('Database fallback batch processing error:', error);
    }
  }

  /**
   * Retry failed transactions from database
   */
  static async retryFailedTransactionsFromDB() {
    const failedTxs = await PendingTransactionModel.find({
      status: 'failed',
      attempts: { $lt: 5 },
      lastAttemptAt: { $lt: new Date(Date.now() - 30 * 1000) } // 30 seconds ago for failed ones
    }).limit(5); // Smaller batch for failed transactions

    for (const tx of failedTxs) {
      try {
        await TransactionRecoveryService.processPendingTransaction(tx.transactionHash);
      } catch (error) {
        console.error(`Database fallback retry failed: ${tx.transactionHash}:`, error);
      }
    }
  }

  /**
   * Check if Redis/BullMQ is available
   */
  static async isRedisAvailable(): Promise<boolean> {
    try {
      const { redisClient } = await import('@/db/redis');
      await redisClient.ping();
      return true;
    } catch (error) {
      console.log('Redis not available:', (error as Error).message);
      return false;
    }
  }

  /**
   * Automatically start fallback if Redis is down
   */
  static async autoStartIfNeeded() {
    const redisAvailable = await this.isRedisAvailable();
    
    if (!redisAvailable && !this.isRunning) {
      console.log('🚨 Redis unavailable, starting database fallback processing');
      await this.startFallbackProcessing();
    } else if (redisAvailable && this.isRunning) {
      console.log('✅ Redis available again, stopping database fallback');
      this.stopFallbackProcessing();
    }
  }

  /**
   * Get fallback processing status
   */
  static getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.intervalId,
    };
  }
}

// Start monitoring Redis availability
setInterval(async () => {
  await DatabaseFallbackService.autoStartIfNeeded();
}, 15000); // Check every 15 seconds 