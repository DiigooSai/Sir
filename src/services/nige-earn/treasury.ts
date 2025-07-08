import { LEDGER_TYPES } from '@/constants';
import { AccountModel } from '@/db/models/account';
import { runInTransaction } from '@/utils/transaction-helper';
import { writeRow } from './ledger';

export interface TreasuryBalance {
  balance: number;
}

/**
 * Mint new coins into the treasury.
 * @throws if amount <= 0 or treasury missing
 */
export async function mintToTreasury(amount: number, meta: Record<string, any> = {}): Promise<TreasuryBalance> {
  if (amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  // find the system (treasury) account
  const treasury = await AccountModel.findOne({ system: true });
  if (!treasury) {
    throw new Error('Treasury account missing');
  }

  // in a transaction, increment treasury and write a MINT row
  await runInTransaction(async (session) => {
    await AccountModel.updateOne({ _id: treasury._id }, { $inc: { balance: amount } }, { session });

    // creditAccount = treasury
    await writeRow({ debitId: null, creditId: treasury._id.toString(), amount, type: LEDGER_TYPES.MINT, meta }, session);
  });

  // return updated balance
  const updated = await AccountModel.findOne({ system: true }).lean();
  return { balance: updated!.balance };
}

/**
 * Burn coins out of the treasury.
 * Debits the treasury and writes a BURN ledger entry.
 * @throws if amount <= 0, treasury missing, or insufficient balance
 */
export async function burnFromTreasury(amount: number, meta: Record<string, any> = {}): Promise<TreasuryBalance> {
  if (amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const treasury = await AccountModel.findOne({ system: true });
  if (!treasury) {
    throw new Error('Treasury account missing');
  }

  await runInTransaction(async (session) => {
    await AccountModel.updateOne({ _id: treasury._id, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { session }).orFail(
      new Error('Insufficient treasury balance')
    );

    // debitAccount = treasury
    await writeRow({ debitId: treasury._id.toString(), creditId: null, amount, type: LEDGER_TYPES.BURN, meta }, session);
  });

  const updated = await AccountModel.findOne({ system: true }).lean();
  return { balance: updated!.balance };
}
