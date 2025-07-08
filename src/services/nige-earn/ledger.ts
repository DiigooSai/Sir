import { ROLES } from '@/constants';
import { LEDGER_TYPES } from '@/constants/ledger';
import { AccountRoleModel, LedgerModel } from '@/db/models';
import { AccountModel, type IAccount } from '@/db/models/account';
import { NEST_ACCOUNT_TYPES, NestAccountModel } from '@/db/models/nige-nest/nest-account';
import { ApiError } from '@/utils/ApiError';
import type { ClientSession, ObjectId, Schema } from 'mongoose';
import { withTxn } from '../nige-nest/asset-ledger';
import { GIVEAWAY_LIMITS } from '@/constants/giveaway-limits';

/* Cache treasury - avoids DB on every reward */
let treasuryId: ObjectId | null = null;
let exchangeId: ObjectId | null = null;
let poolId: ObjectId | null = null;

type LedgerValue = (typeof LEDGER_TYPES)[keyof typeof LEDGER_TYPES];

export async function writeRow(
  {
    debitId,
    creditId,
    amount,
    type,
    meta,
    nestLedgerId,
  }: {
    debitId: Schema.Types.ObjectId | null;
    creditId: Schema.Types.ObjectId | null;
    amount: number;
    type: LedgerValue;
    meta: Record<string, any>;
    nestLedgerId?: Schema.Types.ObjectId;
  },
  session?: ClientSession
) {
  const [row] = await LedgerModel.create(
    [
      {
        debitAccount: debitId,
        creditAccount: creditId,
        amount,
        type,
        meta,
        ...(nestLedgerId ? { nestLedgerId } : {}),
      },
    ],
    { session }
  );
  return row;
}

export const getTreasuryAccount = async (): Promise<IAccount> => {
  // 1️⃣ find the single system=true account
  const acct = await AccountModel.findOne({ system: true }).lean();
  if (!acct) {
    throw new Error('Treasury account missing');
  }
  // 2️⃣ fetch all TREASURY role links
  const links = await AccountRoleModel.find({ roleId: ROLES.TREASURY });

  if (links.length === 0) {
    throw new Error('No AccountRole found for the treasury role');
  }
  if (links.length > 1) {
    throw new Error(`Multiple (${links.length}) AccountRole links found for the treasury role`);
  }

  // 3️⃣ ensure the role link points to the same acct
  const linkedAcctId = links[0].accountId.toString();
  if (linkedAcctId !== acct._id.toString()) {
    throw new Error(`Treasury role links to Account ${linkedAcctId}, but system=true account is ${acct._id}`);
  }

  const account = await AccountModel.findById(links[0].accountId);
  if (!account) throw new Error('Account not found');
  return account;
};

export const getExchangeAccount = async (): Promise<IAccount> => {
  const links = await AccountRoleModel.find({ roleId: ROLES.EXCHANGE });
  if (links.length === 0) {
    throw new Error('No AccountRole found for the exchange role');
  }
  if (links.length > 1) {
    throw new Error(`Multiple (${links.length}) AccountRole links found for the exchange role`);
  }

  const account = await AccountModel.findById(links[0].accountId);
  if (!account) throw new Error('Account not found');
  return account;
};

export const getPoolAccount = async (): Promise<IAccount> => {
  const links = await AccountRoleModel.find({ roleId: ROLES.POOL }).select('accountId').lean();

  if (links.length === 0) {
    throw new Error('No AccountRole found for the pool role');
  }
  if (links.length > 1) {
    throw new Error(`Multiple (${links.length}) AccountRole links found for the pool role`);
  }

  const account = await AccountModel.findById(links[0].accountId);
  if (!account) throw new Error('Account not found');

  return account;
};

export const getNestTreasuryAccount = async () => {
  const treasury = await getTreasuryId();
  const nta = await NestAccountModel.findOne({ accountId: treasury });
  if (!nta) throw new Error('NestAccount not found');
  if (nta.accountType !== NEST_ACCOUNT_TYPES.TREASURY) throw new Error('Treasury account not found');
  return nta;
};

export const getNestExchangeAccount = async () => {
  const exchange = await getExchangeId();
  const nxa = await NestAccountModel.findOne({ accountId: exchange });
  if (!nxa) throw new Error('NestAccount not found');
  if (nxa.accountType !== NEST_ACCOUNT_TYPES.EXCHANGE) throw new Error('Exchange account not found');
  return nxa;
};

export const getNestPoolAccount = async () => {
  const pool = await getPoolId();
  const npa = await NestAccountModel.findOne({ accountId: pool });
  if (!npa) throw new Error('NestAccount not found');
  if (npa.accountType !== NEST_ACCOUNT_TYPES.POOL) throw new Error('Pool account not found');
  return npa;
};

export async function getTreasuryId(): Promise<ObjectId> {
  if (treasuryId) return treasuryId;

  const acc = await getTreasuryAccount();
  treasuryId = acc._id.toString() as ObjectId;
  return treasuryId;
}
export async function getExchangeId(): Promise<ObjectId> {
  if (exchangeId) return exchangeId;
  const acc = await getExchangeAccount();
  exchangeId = acc._id.toString() as ObjectId;
  return exchangeId;
}
export async function getPoolId(): Promise<ObjectId> {
  if (poolId) return poolId;
  const acc = await getPoolAccount();
  poolId = acc._id.toString() as ObjectId;
  return poolId;
}

export async function transfer(
  {
    fromId,
    toId,
    amount,
    type,
    meta = {},
    nestLedgerId,
  }: {
    fromId: Schema.Types.ObjectId;
    toId: Schema.Types.ObjectId;
    amount: number;
    type: LedgerValue;
    meta: Record<string, any>;
    nestLedgerId?: Schema.Types.ObjectId;
  },
  session?: ClientSession
) {
  if (amount <= 0) throw new ApiError(400, 'Amount must be positive');
  if (fromId === toId) throw new ApiError(400, 'Cannot transfer to self');

  return withTxn(session, async (session) => {
    const from = await AccountModel.findOneAndUpdate(
      { _id: fromId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, session }
    );
    if (!from) throw new Error('Insufficient balance');

    await AccountModel.updateOne({ _id: toId }, { $inc: { balance: amount } }, { session });
    const row = await writeRow({ debitId: fromId, creditId: toId, amount, type, meta, nestLedgerId }, session);
    return { rowId: row._id };
  });
}

export async function creditUser(toUserId: Schema.Types.ObjectId, amount: number, meta: Record<string, any>) {
  const fromId = await getTreasuryId();
  await transfer({
    fromId,
    toId: toUserId,
    amount,
    type: LEDGER_TYPES.REWARD,
    meta,
  });
}

export async function globalCoinGiveAway(toUserId: Schema.Types.ObjectId, amount: number, giveawayName: string) {
  if (amount > GIVEAWAY_LIMITS.COIN) {
    throw new Error(`Exceeded max coin giveaway (${GIVEAWAY_LIMITS.COIN})`);
  }
  const exchange = await getExchangeId();
  await transfer({
    fromId: exchange,
    toId: toUserId,
    amount,
    type: LEDGER_TYPES.GIVEAWAY_GLOBAL,
    meta: { giveawayName },
  });
}
