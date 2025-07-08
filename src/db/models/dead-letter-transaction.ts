import { Schema } from 'mongoose';
import { createModel, createSchema } from '../base';

export interface IDeadLetterTransaction {
  accountId: Schema.Types.ObjectId;
  transactionHash: string;
  chain: 'bsc' | 'solana';
  numEggs: number;
  amount: number;
  originalAttempts: number;
  lastError: string;
  failedAt: Date;
  needsManualReview: boolean;
  reviewedBy?: Schema.Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  isResolved: boolean;
  resolvedAt?: Date;
  originalMeta: Record<string, any>;
}

const DeadLetterTransactionSchema = createSchema<IDeadLetterTransaction>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  transactionHash: { type: String, required: true, unique: true },
  chain: { type: String, enum: ['bsc', 'solana'], required: true },
  numEggs: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, min: 0 },
  originalAttempts: { type: Number, required: true },
  lastError: { type: String, required: true },
  failedAt: { type: Date, default: Date.now },
  needsManualReview: { type: Boolean, default: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'Account' },
  reviewedAt: { type: Date },
  reviewNotes: { type: String },
  isResolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  originalMeta: { type: Object, default: {} },
});

// Indexes for efficient querying
DeadLetterTransactionSchema.index({ accountId: 1 });
DeadLetterTransactionSchema.index({ transactionHash: 1 });
DeadLetterTransactionSchema.index({ needsManualReview: 1, isResolved: 1 });
DeadLetterTransactionSchema.index({ failedAt: 1 });
DeadLetterTransactionSchema.index({ chain: 1, isResolved: 1 });

export const DeadLetterTransactionModel = createModel<IDeadLetterTransaction>('DeadLetterTransaction', DeadLetterTransactionSchema); 