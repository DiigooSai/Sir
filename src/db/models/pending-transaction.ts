import { Schema } from 'mongoose';
import { createModel, createSchema } from '../base';

export interface IPendingTransaction {
  accountId: Schema.Types.ObjectId;
  transactionHash: string;
  chain: 'bsc' | 'solana';
  numEggs: number;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  meta: Record<string, any>;
}

const PendingTransactionSchema = createSchema<IPendingTransaction>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  transactionHash: { type: String, required: true, unique: true },
  chain: { type: String, enum: ['bsc', 'solana'], required: true },
  numEggs: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, min: 0 },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  attempts: { type: Number, default: 0 },
  lastAttemptAt: { type: Date },
  completedAt: { type: Date },
  errorMessage: { type: String },
  meta: { type: Object, default: {} },
});

// Indexes for efficient querying
PendingTransactionSchema.index({ accountId: 1, status: 1 });
PendingTransactionSchema.index({ transactionHash: 1 });
PendingTransactionSchema.index({ status: 1, lastAttemptAt: 1 });

export const PendingTransactionModel = createModel<IPendingTransaction>('PendingTransaction', PendingTransactionSchema); 