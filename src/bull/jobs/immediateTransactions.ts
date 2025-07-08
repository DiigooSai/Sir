import { createQueue } from '../base';
import { TransactionRecoveryService } from '@/services/nige-nest/transaction-recovery.service';

/**
 * Immediate transaction processing job for sub-5-second latency
 * This processes individual transactions as soon as they're submitted
 */
const processImmediateTransactionJob = async (job: any) => {
  const { transactionHash } = job.data;
  console.log(`🚀 Processing immediate transaction: ${transactionHash}`);
  
  try {
    const result = await TransactionRecoveryService.processPendingTransaction(transactionHash);
    console.log(`✅ Immediate transaction processed: ${transactionHash}`);
    return result;
  } catch (error) {
    console.error(`❌ Immediate transaction failed: ${transactionHash}`, error);
    throw error;
  }
};

// Create the queue and worker for immediate processing
export const { queue: immediateTransactionQueue, worker: immediateTransactionWorker } = createQueue(
  'immediate-transactions',
  processImmediateTransactionJob
);

/**
 * Add a transaction for immediate processing
 */
export const addImmediateTransaction = async (transactionHash: string) => {
  await immediateTransactionQueue.add(
    'process-immediate-transaction',
    { transactionHash },
    {
      // High priority for immediate processing
      priority: 100,
      // Remove job after completion
      removeOnComplete: true,
      removeOnFail: false,
      // Retry with short delays
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // Start with 1 second
      },
    }
  );
  
  console.log(`📨 Added transaction for immediate processing: ${transactionHash}`);
};

export const initImmediateTransactionProcessing = async () => {
  console.log('✅ Immediate transaction processing initialized');
}; 