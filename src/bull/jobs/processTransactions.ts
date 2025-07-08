import { createQueue } from '../base';
import { TransactionRecoveryService } from '@/services/nige-nest/transaction-recovery.service';

/**
 * Background job to process pending transactions every 30 seconds
 */
const processPendingTransactionsJob = async (job: any) => {
  console.log('Processing pending transactions...');
  
  try {
    // Process all pending transactions
    const results = await TransactionRecoveryService.processAllPendingTransactions();
    
    // Retry failed transactions that are eligible for retry
    await TransactionRecoveryService.retryFailedTransactions();
    
    console.log(`Processed ${results.length} pending transactions`);
    
    return {
      success: true,
      processedCount: results.length,
      results: results.slice(0, 10) // Only return first 10 for logging
    };
  } catch (error) {
    console.error('Error processing pending transactions:', error);
    throw error;
  }
};

// Create the queue and worker
export const { queue: transactionQueue, worker: transactionWorker } = createQueue(
  'pending-transactions',
  processPendingTransactionsJob
);

// Add repeatable job to process transactions every 3 seconds for fast response
export const initTransactionProcessing = async () => {
  await transactionQueue.add(
    'process-pending-transactions',
    {},
    {
      repeat: {
        every: 3000, // 3 seconds - much faster for sub-5s latency
      },
      removeOnComplete: 20,
      removeOnFail: 10,
    }
  );
  
  console.log('✅ Fast transaction processing job initialized (3s intervals)');
}; 