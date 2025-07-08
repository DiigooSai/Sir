#!/usr/bin/env bun
/**
 * Recovery Script for Pending USDT Transactions
 * 
 * This script helps users who have sent USDT to purchase eggs but didn't receive them
 * due to API failures or other issues. It can:
 * 1. Check if a transaction is valid on-chain
 * 2. Create a pending transaction record if missing
 * 3. Process the transaction to credit eggs
 * 
 * Usage:
 * bun run src/scripts/recover-pending-transactions.ts
 */

import { parsedEnv } from '../../env';
import connectDB from '../db/connect';
import { bootstrapRedis } from '../db/redis/bootstrap';
import { TransactionRecoveryService } from '../services/nige-nest/transaction-recovery.service';
import { verifyTransactionOnChain } from '../utils/verifyTransactionOnChain';
import { AssetLedgerModel } from '../db/models/nige-nest/asset-ledger';
import { PendingTransactionModel } from '../db/models/pending-transaction';
import { UserModel } from '../db/models';

interface RecoveryRequest {
  accountId: string;
  transactionHash: string;
  chain: 'bsc' | 'solana';
  numEggs: number;
}

// Add recovery requests here - users experiencing the issue can add their details
const RECOVERY_REQUESTS: RecoveryRequest[] = [
  // Example:
  // {
  //   accountId: "USER_ACCOUNT_ID",
  //   transactionHash: "0x...",
  //   chain: "bsc",
  //   numEggs: 10
  // }
];

async function recoverTransaction(request: RecoveryRequest): Promise<void> {
  const { accountId, transactionHash, chain, numEggs } = request;
  
  console.log(`\n🔍 Processing recovery for transaction: ${transactionHash}`);
  console.log(`   Account: ${accountId}`);
  console.log(`   Chain: ${chain}`);
  console.log(`   Expected Eggs: ${numEggs}`);

  try {
    // 1. Check if transaction already exists in asset ledger
    const existingLedger = await AssetLedgerModel.findOne({
      $or: [
        { transactionHash },
        { 'meta.transactionHash': transactionHash }
      ]
    });

    if (existingLedger) {
      console.log(`   ✅ Transaction already processed in asset ledger`);
      return;
    }

    // 2. Check if transaction exists in pending transactions
    let pendingTx = await PendingTransactionModel.findOne({ transactionHash });

    if (pendingTx) {
      if (pendingTx.status === 'completed') {
        console.log(`   ✅ Transaction already completed`);
        return;
      }
      console.log(`   📋 Found existing pending transaction with status: ${pendingTx.status}`);
    } else {
      // 3. Verify transaction on chain first
      console.log(`   🔗 Verifying transaction on ${chain} blockchain...`);
      const verifiedTx = await verifyTransactionOnChain({
        transactionHash,
        chain,
        numEggs,
      });

      if (!verifiedTx || verifiedTx.status !== 1) {
        console.log(`   ❌ Transaction verification failed or transaction not found`);
        return;
      }

      console.log(`   ✅ Transaction verified on chain`);
      console.log(`   💰 Amount: ${verifiedTx.amount} USDT`);

      // 4. Create pending transaction record
      console.log(`   📝 Creating pending transaction record...`);
      pendingTx = await TransactionRecoveryService.createPendingTransaction({
        accountId,
        transactionHash,
        chain,
        numEggs,
        amount: verifiedTx.amount || 0,
        meta: {
          recoveryScript: true,
          verifiedAt: new Date(),
          fromRecovery: true
        }
      });
      console.log(`   ✅ Pending transaction created with ID: ${pendingTx._id}`);
    }

    // 5. Process the pending transaction
    console.log(`   ⚡ Processing pending transaction...`);
    const result = await TransactionRecoveryService.processPendingTransaction(transactionHash);
    
    if (result.success) {
      console.log(`   🎉 SUCCESS: Eggs credited successfully!`);
      console.log(`   📊 Result:`, result);
    } else {
      console.log(`   ⚠️  Processing failed, will retry automatically`);
    }

  } catch (error) {
    console.log(`   ❌ Error processing recovery:`, (error as Error).message);
    console.log(`   ℹ️  This transaction will be retried by the background job`);
  }
}

async function checkUserExists(accountId: string): Promise<boolean> {
  const user = await UserModel.findOne({ accountId });
  return !!user;
}

async function main() {
  console.log('🚀 Starting Transaction Recovery Script');
  console.log('=====================================');

  // Initialize connections
  parsedEnv();
  await connectDB();
  await bootstrapRedis();

  if (RECOVERY_REQUESTS.length === 0) {
    console.log('\n📝 No recovery requests found in RECOVERY_REQUESTS array.');
    console.log('📖 To use this script:');
    console.log('   1. Add recovery requests to the RECOVERY_REQUESTS array');
    console.log('   2. Each request should include: accountId, transactionHash, chain, numEggs');
    console.log('   3. Run the script again');
    console.log('\n💡 Users can also use the recovery API endpoint:');
    console.log('   POST /nige-nest/escrow/recover-transaction');
    console.log('   Body: { transactionHash, chain, numEggs }');
    
    process.exit(0);
  }

  console.log(`\n📋 Found ${RECOVERY_REQUESTS.length} recovery requests`);

  for (const request of RECOVERY_REQUESTS) {
    // Validate user exists
    const userExists = await checkUserExists(request.accountId);
    if (!userExists) {
      console.log(`\n❌ User with accountId ${request.accountId} not found, skipping...`);
      continue;
    }

    await recoverTransaction(request);
    
    // Small delay between transactions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ Recovery script completed!');
  console.log('\n📊 Summary:');
  console.log('   - Check the logs above for individual transaction results');
  console.log('   - Failed transactions will be retried automatically by background jobs');
  console.log('   - Users should see their eggs within 1-2 minutes for successful recoveries');
  
  process.exit(0);
}

// Additional utility functions for manual recovery
export async function recoverSingleTransaction(
  transactionHash: string,
  chain: 'bsc' | 'solana',
  numEggs: number,
  accountId: string
) {
  await recoverTransaction({ accountId, transactionHash, chain, numEggs });
}

export async function checkTransactionStatus(transactionHash: string) {
  const [pendingTx, assetLedger] = await Promise.all([
    PendingTransactionModel.findOne({ transactionHash }),
    AssetLedgerModel.findOne({
      $or: [
        { transactionHash },
        { 'meta.transactionHash': transactionHash }
      ]
    })
  ]);

  return {
    isPending: !!pendingTx,
    pendingStatus: pendingTx?.status,
    isProcessed: !!assetLedger,
    pendingTransaction: pendingTx,
    assetLedger: assetLedger
  };
}

// Run the script if called directly
if (import.meta.main) {
  main().catch(console.error);
} 