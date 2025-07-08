import { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import { NestAccountModel } from '@/db/models/nige-nest/nest-account';
import { AssetLedgerModel, ACTIONS, GiveAwayCoinEggSchema, GiveAwayGemSchema, INTENT_STATUSES } from '@/db/models/nige-nest/asset-ledger';
import { ASSETS, type AssetType } from '@/db/models/nige-nest/asset';
import { gemAmountZ, mongoIdZod } from '@/db/common-schemas';
import { getExchangeId, getTreasuryId, getPoolId, transfer } from '../nige-earn/ledger';
import { runInTransaction } from '@/utils/transaction-helper';
import { ESCROW } from '@/constants/escrow';
import { InNestEntryModel } from '@/db/models/nige-nest/in-nest-entry';
import { checkAndGetValidNestUserAccount, validNestExists } from './nest';
import { AccountModel } from '@/db/models';
import { LEDGER_TYPES } from '@/constants';
import { UserNestUnlockModel } from '@/db/models/nige-nest/user-nest-unlock';
import { GIVEAWAY_LIMITS } from '@/constants/giveaway-limits';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type LedgerIdMap = Partial<Record<(typeof ACTIONS)[keyof typeof ACTIONS], Types.ObjectId>>;

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

async function adjustBalance(accountId: Types.ObjectId, asset: AssetType, delta: number, session: ClientSession) {
  if (asset === ASSETS.COIN) {
    // coin lives in Account.balance
    const res = await AccountModel.updateOne(
      { _id: accountId, balance: { $gte: delta < 0 ? -delta : 0 } },
      { $inc: { balance: delta } },
      { session }
    );
    if (res.modifiedCount === 0) {
      throw new Error('Insufficient coin balance');
    }
    return;
  }

  // eggs/gems live in NestAccount
  const na = await NestAccountModel.findOne({ accountId }).session(session);
  if (!na) throw new Error('NestAccount not found');
  const field = asset === ASSETS.EGG ? 'eggs' : 'gems';
  const next = (na as any)[field] + delta;
  if (next < 0) throw new Error('Insufficient balance');
  (na as any)[field] = next;
  await na.save({ session });
}

/* -------------------------------------------------------------------------- */
/* Write Nest-coin dual ledger                                               */
/* -------------------------------------------------------------------------- */
async function writeNestCoinLedger(
  doc: Omit<Parameters<typeof AssetLedgerModel.create>[0][0], 'meta'> & {
    meta?: Record<string, any>;
  },
  session: ClientSession
): Promise<{ assetLedgerId: Types.ObjectId; coinLedgerId: Types.ObjectId }> {
  const { debitAccount, creditAccount, amount, action, meta = {} } = doc;

  // 2️⃣ insert Nest’s AssetLedger row
  const [assetRow] = await AssetLedgerModel.create([{ ...doc, assetId: ASSETS.COIN, meta, action }], { session });
  const assetRowId = assetRow._id.toString();

  const { rowId } = await transfer(
    {
      fromId: debitAccount,
      toId: creditAccount,
      amount,
      type: LEDGER_TYPES.NEST_COIN,
      meta,
      ...(assetRowId ? { nestLedgerId: assetRowId as Types.ObjectId } : {}),
    },
    session
  );

  return { assetLedgerId: assetRow._id, coinLedgerId: rowId };
}

/* -------------------------------------------------------------------------- */
/* Unified recordTransfer                                                     */
/* -------------------------------------------------------------------------- */
async function recordTransfer(
  doc: Omit<Parameters<typeof AssetLedgerModel.create>[0][0], 'meta'> & {
    meta?: Record<string, any>;
  },
  session: ClientSession
): Promise<Types.ObjectId> {
  if (doc.assetId === ASSETS.COIN) {
    const { assetLedgerId } = await writeNestCoinLedger(doc as any, session);
    return assetLedgerId;
  }

  // eggs/gems only
  if (doc.debitAccount) await adjustBalance(doc.debitAccount, doc.assetId, -doc.amount, session);
  if (doc.creditAccount) await adjustBalance(doc.creditAccount, doc.assetId, doc.amount, session);
  const [row] = await AssetLedgerModel.create([{ ...doc, meta: doc.meta ?? {} }], { session });
  return row._id;
}

/* -------------------------------------------------------------------------- */
/* Transaction wrapper                                                        */
/* -------------------------------------------------------------------------- */
export async function withTxn<T>(maybeSession: ClientSession | undefined, cb: (session: ClientSession) => Promise<T>): Promise<T> {
  if (maybeSession) return cb(maybeSession);
  return runInTransaction(cb) as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/* Zod primitives                                                             */
/* -------------------------------------------------------------------------- */
const EggQtyZ = z.number().positive().int();
const GemQtyIntZ = z.number().positive().int();
const CoinQtyZ = z.number().positive().int();

/* Tx-ID helper */
export const newId = () => new Types.ObjectId();

/* -------------------------------------------------------------------------- */
/* 1 ▸ Mint / Burn                                                            */
/* -------------------------------------------------------------------------- */

export const MintEggsInput = z.object({ numEggs: EggQtyZ }).strict();
export async function mintEggs(p: z.infer<typeof MintEggsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  if (p.numEggs > ESCROW.MAX_EGGS_MINT_LIMIT) throw new Error('Exceeded max mint limit');
  const treasury = await getTreasuryId();

  return withTxn(session, async (s) => ({
    [ACTIONS.MINT_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.MINT_EGG,
        debitAccount: null,
        creditAccount: treasury,
        amount: p.numEggs,
      },
      s
    ),
  }));
}

export const BurnEggsInput = z.object({ numEggs: EggQtyZ }).strict();
export async function burnEggs(p: z.infer<typeof BurnEggsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  if (p.numEggs > ESCROW.MAX_EGGS_BURN_LIMIT) throw new Error('Exceeded max burn limit');
  const treasury = await getTreasuryId();

  return withTxn(session, async (s) => ({
    [ACTIONS.BURN_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.BURN_EGG,
        debitAccount: treasury,
        creditAccount: null,
        amount: p.numEggs,
      },
      s
    ),
  }));
}

export const MintGemsInput = z.object({ numGems: gemAmountZ }).strict();
export async function mintGems(p: z.infer<typeof MintGemsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  return withTxn(session, async (s) => ({
    [ACTIONS.MINT_GEM]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.MINT_GEM,
        debitAccount: null,
        creditAccount: treasury,
        amount: p.numGems,
      },
      s
    ),
  }));
}

export const BurnGemsInput = z.object({ numGems: gemAmountZ }).strict();
export async function burnGems(p: z.infer<typeof BurnGemsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  return withTxn(session, async (s) => ({
    [ACTIONS.BURN_GEM]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.BURN_GEM,
        debitAccount: treasury,
        creditAccount: null,
        amount: p.numGems,
      },
      s
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/* 2 ▸ Buy / Sell                                                             */
/* -------------------------------------------------------------------------- */

export const BuyEggsInput = z
  .object({
    accountId: mongoIdZod,
    numEggs: EggQtyZ,
    transactionHash: mongoIdZod,
    meta: z.object({
      transactionHash: z.string().min(6),
      chain: z.enum(['bsc', 'solana']),
    }),
  })
  .strict();
export async function buyEggs(p: z.infer<typeof BuyEggsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.BUY_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.BUY_EGG,
        debitAccount: exchange,
        creditAccount: new Types.ObjectId(p.accountId),
        amount: p.numEggs,
        transactionHash: p.transactionHash,
        meta: p.meta,
      },
      s
    ),
  }));
}

export const SellGemIntentInput = z
  .object({
    accountId: mongoIdZod,
    amount: gemAmountZ,
  })
  .strict();

export async function sellGemIntent(p: z.infer<typeof SellGemIntentInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const exchange = await getExchangeId();

  return withTxn(session, async (s) => ({
    [ACTIONS.SELL_GEM_INTENT]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.SELL_GEM_INTENT,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: exchange,
        amount: p.amount,
        status: INTENT_STATUSES.PENDING, // 'pending'
      },
      s
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/*  ✦  PHASE 2 :  admin approves                                              */
/* -------------------------------------------------------------------------- */
export const ApproveSellGemInput = z
  .object({
    intentLedgerId: mongoIdZod,
    transactionHash: z.string().min(6),
  })
  .strict();

export async function approveSellGem(p: z.infer<typeof ApproveSellGemInput>, session?: ClientSession): Promise<LedgerIdMap> {
  return withTxn(session, async (s) => {
    /* 1️⃣ fetch + sanity */
    const intent = await AssetLedgerModel.findById(p.intentLedgerId).session(s);
    if (!intent || intent.action !== ACTIONS.SELL_GEM_INTENT) throw new Error('Intent not found');
    if (intent.status !== 'pending') throw new Error('Intent already resolved');

    const exchange = intent.creditAccount!;
    const treasury = await getTreasuryId();
    const amount = intent.amount;

    /* 2️⃣ transfer exchange → treasury */
    const approveId = await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.SELL_GEM_APPROVE,
        debitAccount: exchange,
        creditAccount: treasury,
        amount,
        linkedLedgerId: intent._id,
        transactionHash: p.transactionHash,
      },
      s
    );

    /* 3️⃣ mark intent */
    intent.status = INTENT_STATUSES.APPROVED;
    await intent.save({ session: s });

    return { [ACTIONS.SELL_GEM_APPROVE]: approveId };
  });
}

/* -------------------------------------------------------------------------- */
/*  ✦  PHASE 3 :  admin rejects                                               */
/* -------------------------------------------------------------------------- */
export const RejectSellGemInput = z
  .object({
    intentLedgerId: mongoIdZod,
  })
  .strict();

export async function rejectSellGem(p: z.infer<typeof RejectSellGemInput>, session?: ClientSession): Promise<LedgerIdMap> {
  return withTxn(session, async (s) => {
    /* 1️⃣ fetch + sanity */
    const intent = await AssetLedgerModel.findById(p.intentLedgerId).session(s);
    if (!intent || intent.action !== ACTIONS.SELL_GEM_INTENT) throw new Error('Intent not found');
    if (intent.status !== 'pending') throw new Error('Intent already resolved');

    const exchange = intent.creditAccount!;
    const user = intent.debitAccount!;
    const amount = intent.amount;

    /* 2️⃣ refund exchange → user */
    const rejectId = await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.SELL_GEM_REJECT,
        debitAccount: exchange,
        creditAccount: user,
        amount,
        linkedLedgerId: intent._id,
      },
      s
    );

    /* 3️⃣ mark intent */
    intent.status = INTENT_STATUSES.REJECTED;
    await intent.save({ session: s });

    return { [ACTIONS.SELL_GEM_REJECT]: rejectId };
  });
}

/* -------------------------------------------------------------------------- */
/* 3 ▸ Treasury ↔ Exchange                                                    */
/* -------------------------------------------------------------------------- */

export const FundExchangeEggInput = z.object({ numEggs: EggQtyZ }).strict();
export async function fundExchangeEgg(p: z.infer<typeof FundExchangeEggInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.FUND_EXCHANGE_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.FUND_EXCHANGE_EGG,
        debitAccount: treasury,
        creditAccount: exchange,
        amount: p.numEggs,
      },
      s
    ),
  }));
}

export const WithdrawExchangeEggInput = z.object({ numEggs: EggQtyZ }).strict();
export async function withdrawExchangeEgg(p: z.infer<typeof WithdrawExchangeEggInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.WITHDRAW_EXCHANGE_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.WITHDRAW_EXCHANGE_EGG,
        debitAccount: exchange,
        creditAccount: treasury,
        amount: p.numEggs,
      },
      s
    ),
  }));
}

export const FundExchangeGemInput = z.object({ numGems: gemAmountZ }).strict();
export async function fundExchangeGem(p: z.infer<typeof FundExchangeGemInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.FUND_EXCHANGE_GEM]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.FUND_EXCHANGE_GEM,
        debitAccount: treasury,
        creditAccount: exchange,
        amount: p.numGems,
      },
      s
    ),
  }));
}

export const WithdrawExchangeGemInput = z.object({ numGems: gemAmountZ }).strict();
export async function withdrawExchangeGem(p: z.infer<typeof WithdrawExchangeGemInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.WITHDRAW_EXCHANGE_GEM]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.WITHDRAW_EXCHANGE_GEM,
        debitAccount: exchange,
        creditAccount: treasury,
        amount: p.numGems,
      },
      s
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/* 4 ▸ Treasury ↔ Pool                                                        */
/* -------------------------------------------------------------------------- */

export const FundPoolEggInput = z.object({ numEggs: EggQtyZ }).strict();
export async function fundPoolEgg(p: z.infer<typeof FundPoolEggInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const pool = await getPoolId();
  return withTxn(session, async (s) => ({
    [ACTIONS.FUND_POOL_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.FUND_POOL_EGG,
        debitAccount: treasury,
        creditAccount: pool,
        amount: p.numEggs,
      },
      s
    ),
  }));
}

export const WithdrawPoolEggInput = z.object({ numEggs: EggQtyZ }).strict();
export async function withdrawPoolEgg(p: z.infer<typeof WithdrawPoolEggInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const pool = await getPoolId();
  return withTxn(session, async (s) => ({
    [ACTIONS.WITHDRAW_POOL_EGG]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.WITHDRAW_POOL_EGG,
        debitAccount: pool,
        creditAccount: treasury,
        amount: p.numEggs,
      },
      s
    ),
  }));
}

export const FundPoolGemInput = z.object({ numGems: gemAmountZ }).strict();
export async function fundPoolGem(p: z.infer<typeof FundPoolGemInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const pool = await getPoolId();
  return withTxn(session, async (s) => ({
    [ACTIONS.FUND_POOL_GEM]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.FUND_POOL_GEM,
        debitAccount: treasury,
        creditAccount: pool,
        amount: p.numGems,
      },
      s
    ),
  }));
}

export const WithdrawPoolGemInput = z.object({ numGems: gemAmountZ }).strict();
export async function withdrawPoolGem(p: z.infer<typeof WithdrawPoolGemInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const pool = await getPoolId();
  return withTxn(session, async (s) => ({
    [ACTIONS.WITHDRAW_POOL_GEM]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.WITHDRAW_POOL_GEM,
        debitAccount: pool,
        creditAccount: treasury,
        amount: p.numGems,
      },
      s
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/* 5 ▸ Break eggs → gems                                                     */
/* -------------------------------------------------------------------------- */

export const BreakEggsInput = z.object({ accountId: mongoIdZod, numEggsBreak: EggQtyZ }).strict();
export async function breakEggs(p: z.infer<typeof BreakEggsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const linkId = newId();
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();

  return withTxn(session, async (s) => {
    const firstId = await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.BREAK_EGG_TO_GEM,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: treasury,
        amount: p.numEggsBreak,
        linkedLedgerId: linkId,
      },
      s
    );

    const secondId = await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.BREAKED_GEM_FROM_EGG,
        debitAccount: exchange,
        creditAccount: new Types.ObjectId(p.accountId),
        amount: p.numEggsBreak,
        linkedLedgerId: linkId,
      },
      s
    );

    return {
      [ACTIONS.BREAK_EGG_TO_GEM]: firstId,
      [ACTIONS.BREAKED_GEM_FROM_EGG]: secondId,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 6 ▸ Convert gems → eggs                                                   */
/* -------------------------------------------------------------------------- */

export const ConvertGemsInput = z.object({ accountId: mongoIdZod, amount: GemQtyIntZ }).strict();
export async function convertGems(p: z.infer<typeof ConvertGemsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const linkId = newId();
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();

  return withTxn(session, async (s) => {
    const firstId = await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.CONVERT_GEM_TO_EGG,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: treasury,
        amount: p.amount,
        linkedLedgerId: linkId,
      },
      s
    );

    const secondId = await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.CONVERTED_EGG_FROM_GEM,
        debitAccount: exchange,
        creditAccount: new Types.ObjectId(p.accountId),
        amount: p.amount,
        linkedLedgerId: linkId,
      },
      s
    );

    return {
      [ACTIONS.CONVERT_GEM_TO_EGG]: firstId,
      [ACTIONS.CONVERTED_EGG_FROM_GEM]: secondId,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 7 ▸ In-nest                                                                */
/* -------------------------------------------------------------------------- */

export const InNestInput = z.object({ nestId: mongoIdZod, accountId: mongoIdZod, eggCount: EggQtyZ }).strict();
export async function inNest(p: z.infer<typeof InNestInput>, session?: ClientSession): Promise<LedgerIdMap & { entryId: Types.ObjectId }> {
  const pool = await getPoolId();

  return withTxn(session, async (s) => {
    const [entry] = await InNestEntryModel.create([{ accountId: p.accountId, nestId: p.nestId, eggCount: p.eggCount }], { session: s });

    const ledgerId = await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.IN_NEST,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: pool,
        amount: p.eggCount,
        nestInvestmentId: entry._id,
      },
      s
    );

    return {
      [ACTIONS.IN_NEST]: ledgerId,
      entryId: entry._id,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 8 ▸ Egging rewards                                                         */
/* -------------------------------------------------------------------------- */

export const EggingEggInput = z.object({ nestInvestmentId: mongoIdZod }).strict();
export async function eggingEgg(
  input: z.infer<typeof EggingEggInput>,
  session?: ClientSession
): Promise<Record<typeof ACTIONS.EGGING_EGG, Types.ObjectId>> {
  const { nestInvestmentId } = EggingEggInput.parse(input);

  return withTxn(session, async (s) => {
    // 1️⃣ load the in-nest entry
    const entry = await InNestEntryModel.findById(nestInvestmentId).select('accountId eggCount gotCancelled areCooled nestId').session(s);
    if (!entry) {
      throw new Error(`In-nest entry ${nestInvestmentId} not found`);
    }
    if (entry.areCooled) {
      throw new Error(`Entry ${nestInvestmentId} already cooled`);
    }

    // 2️⃣ ensure nest still in-flight
    const nest = await validNestExists(entry.nestId.toString());

    if (nest.isCoolDownEnded) {
      throw new Error(`Nest ${nest._id} cooldown ended`);
    }

    // 3️⃣ do the transfer: pool → user
    const pool = await getPoolId();
    const ledgerId = await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.EGGING_EGG,
        debitAccount: pool,
        creditAccount: entry.accountId,
        amount: entry.eggCount,
        nestInvestmentId: entry._id,
      },
      s
    );

    // 4️⃣ mark the entry as cooled
    await InNestEntryModel.updateOne({ _id: entry._id }, { areCooled: ledgerId }, { session: s });

    return { [ACTIONS.EGGING_EGG]: ledgerId };
  });
}

export const EggingGemInput = z.object({ nestInvestmentId: z.string().nonempty(), gemReturnFactor: z.number().nonnegative() }).strict();

export async function eggingGem(
  input: z.infer<typeof EggingGemInput>,
  session?: ClientSession
): Promise<Record<typeof ACTIONS.EGGING_GEM, Types.ObjectId>> {
  const { nestInvestmentId } = EggingGemInput.parse(input);

  return withTxn(session, async (s) => {
    // 1️⃣ load the in-nest entry
    const entry = await InNestEntryModel.findById(nestInvestmentId).select('accountId eggCount areGemsDistributed nestId').session(s);
    if (!entry) throw new Error(`In-nest entry ${nestInvestmentId} not found`);
    if (entry.areGemsDistributed) {
      throw new Error(`Entry ${nestInvestmentId} already had gems distributed`);
    }

    // 2️⃣ ensure nest still in-flight
    const nest = await validNestExists(entry.nestId.toString());
    if (!nest.isLaunched) throw new Error(`Nest ${nest._id} not launched`);
    if (nest.isNestEnded) throw new Error(`Nest ${nest._id} already ended`);
    if (nest.isCoolDownEnded) throw new Error(`Nest ${nest._id} cooldown ended`);

    // 3️⃣ perform transfer: pool → user
    const pool = await getPoolId();
    const ledgerId = await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.EGGING_GEM,
        debitAccount: pool,
        creditAccount: entry.accountId,
        amount: entry.eggCount * input.gemReturnFactor,
        nestInvestmentId: entry._id,
      },
      s
    );

    // 4️⃣ mark the entry as distributed
    await InNestEntryModel.updateOne({ _id: entry._id }, { areGemsDistributed: ledgerId }, { session: s });

    return { [ACTIONS.EGGING_GEM]: ledgerId };
  });
}

export const ReturnNestEggInput = z
  .object({
    nestInvestmentId: mongoIdZod,
  })
  .strict();
export type ReturnNestEggInput = z.infer<typeof ReturnNestEggInput>;

export async function returnNestEgg(
  input: ReturnNestEggInput,
  session?: ClientSession
): Promise<Record<typeof ACTIONS.RETURN_NEST_EGG, Types.ObjectId>> {
  const { nestInvestmentId } = ReturnNestEggInput.parse(input);

  return withTxn(session, async (s) => {
    // 1️⃣ load the entry
    const entry = await InNestEntryModel.findById(nestInvestmentId).select('nestId accountId eggCount gotCancelled').session(s);
    if (!entry) {
      throw new Error(`In‐nest entry ${nestInvestmentId} not found`);
    }
    if (entry.gotCancelled) {
      throw new Error(`Entry ${nestInvestmentId} already had eggs returned`);
    }

    // 2️⃣ check nest flags
    const nest = await validNestExists(entry.nestId.toString());
    if (nest.isNestEnded) {
      throw new Error(`Nest ${entry.nestId} already ended`);
    }
    if (nest.isCoolDownEnded) {
      throw new Error(`Nest ${entry.nestId} cooldown ended`);
    }

    // 3️⃣ perform transfer: pool → user
    const poolAccount = await getPoolId();
    const ledgerId = await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.RETURN_NEST_EGG,
        debitAccount: poolAccount,
        creditAccount: entry.accountId,
        amount: entry.eggCount,
        nestInvestmentId: entry._id,
      },
      s
    );

    // 4️⃣ mark the entry as cancelled
    await InNestEntryModel.updateOne({ _id: entry._id }, { gotCancelled: ledgerId }, { session: s });

    return { [ACTIONS.RETURN_NEST_EGG]: ledgerId };
  });
}

/* -------------------------------------------------------------------------- */
/* 2 ▸ Coin-only operations                                                   */
/* -------------------------------------------------------------------------- */
export const FundExchangeCoinInput = z.object({ numCoins: CoinQtyZ }).strict();
export async function fundExchangeCoin(p: z.infer<typeof FundExchangeCoinInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.FUND_EXCHANGE_COIN]: await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.FUND_EXCHANGE_COIN,
        debitAccount: treasury,
        creditAccount: exchange,
        amount: p.numCoins,
      },
      s
    ),
  }));
}

export const WithdrawExchangeCoinInput = z.object({ numCoins: CoinQtyZ }).strict();
export async function withdrawExchangeCoin(p: z.infer<typeof WithdrawExchangeCoinInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.WITHDRAW_EXCHANGE_COIN]: await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.WITHDRAW_EXCHANGE_COIN,
        debitAccount: exchange,
        creditAccount: treasury,
        amount: p.numCoins,
      },
      s
    ),
  }));
}

export const FundPoolCoinInput = z.object({ numCoins: CoinQtyZ }).strict();
export async function fundPoolCoin(p: z.infer<typeof FundPoolCoinInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const pool = await getPoolId();
  return withTxn(session, async (s) => ({
    [ACTIONS.FUND_POOL_COIN]: await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.FUND_POOL_COIN,
        debitAccount: treasury,
        creditAccount: pool,
        amount: p.numCoins,
      },
      s
    ),
  }));
}

export const WithdrawPoolCoinInput = z.object({ numCoins: CoinQtyZ }).strict();
export async function withdrawPoolCoin(p: z.infer<typeof WithdrawPoolCoinInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const treasury = await getTreasuryId();
  const pool = await getPoolId();
  return withTxn(session, async (s) => ({
    [ACTIONS.WITHDRAW_POOL_COIN]: await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.WITHDRAW_POOL_COIN,
        debitAccount: pool,
        creditAccount: treasury,
        amount: p.numCoins,
      },
      s
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/* 3 ▸ Coin-to-Gem & Coin-to-Egg conversions                                   */
/* -------------------------------------------------------------------------- */
export const ConvertCoinsToGemsInput = z.object({ accountId: mongoIdZod, numCoins: CoinQtyZ }).strict();
export async function convertCoinsToGems(p: z.infer<typeof ConvertCoinsToGemsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const linkId = newId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => {
    // 1: user → exchange (coin)
    const firstId = await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.CONVERT_COIN_TO_GEM,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: exchange,
        amount: p.numCoins,
        linkedLedgerId: linkId,
      },
      s
    );
    // 2: exchange → user (gem)
    const secondId = await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.CONVERTED_GEM_FROM_COIN,
        debitAccount: exchange,
        creditAccount: new Types.ObjectId(p.accountId),
        amount: p.numCoins * 1,
        linkedLedgerId: linkId,
      },
      s
    );
    return {
      [ACTIONS.CONVERT_COIN_TO_GEM]: firstId,
      [ACTIONS.CONVERTED_GEM_FROM_COIN]: secondId,
    };
  });
}

export const ConvertCoinsToEggsInput = z.object({ accountId: mongoIdZod, numCoins: CoinQtyZ, eggRate: EggQtyZ }).strict();
export async function convertCoinsToEggs(p: z.infer<typeof ConvertCoinsToEggsInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const linkId = newId();
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => {
    // 1: user → exchange (coin)
    const firstId = await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.CONVERT_COIN_TO_EGG,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: exchange,
        amount: p.numCoins,
        linkedLedgerId: linkId,
      },
      s
    );
    // 2: exchange → user (egg)
    const secondId = await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.CONVERTED_EGG_FROM_COIN,
        debitAccount: exchange,
        creditAccount: new Types.ObjectId(p.accountId),
        amount: p.eggRate,
        linkedLedgerId: linkId,
      },
      s
    );
    return {
      [ACTIONS.CONVERT_COIN_TO_EGG]: firstId,
      [ACTIONS.CONVERTED_EGG_FROM_COIN]: secondId,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 3 ↦ Unlock‐nest coin                                                         */
/* -------------------------------------------------------------------------- */
export const UnlockNestInput = z
  .object({
    accountId: mongoIdZod,
    unlockNestId: mongoIdZod,
    amount: CoinQtyZ,
  })
  .strict();

const NestedUnlockInput = z
  .object({
    accountId: mongoIdZod,
    nestId: mongoIdZod,
    amount: CoinQtyZ,
  })
  .strict();

export type UnlockNestResult = LedgerIdMap & { entryId: Types.ObjectId };

export async function unlockNest(p: z.infer<typeof NestedUnlockInput>, session?: ClientSession): Promise<UnlockNestResult> {
  return withTxn(session, async (s) => {
    // 1️⃣ Create the unlock record
    const [entry] = await UserNestUnlockModel.create(
      [
        {
          accountId: new Types.ObjectId(p.accountId),
          nestId: new Types.ObjectId(p.nestId),
        },
      ],
      { session: s }
    );

    // 2️⃣ Write the coin ledger, linking to that entry
    const ledgerId = await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.UNLOCK_NEST,
        debitAccount: new Types.ObjectId(p.accountId),
        creditAccount: await getTreasuryId(),
        amount: p.amount,
        unlockNestId: entry._id,
      },
      s
    );

    return {
      [ACTIONS.UNLOCK_NEST]: ledgerId,
      entryId: entry._id,
    };
  });
}

export const QuizRewardInput = z.object({ accountId: mongoIdZod, numCoins: CoinQtyZ, quizAttemptId: mongoIdZod }).strict();

export async function quizReward(p: z.infer<typeof QuizRewardInput>, session?: ClientSession): Promise<LedgerIdMap> {
  const exchange = await getExchangeId();
  return withTxn(session, async (s) => ({
    [ACTIONS.QUIZ_ATTEMPT_REWARD]: await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.QUIZ_ATTEMPT_REWARD,
        debitAccount: exchange,
        creditAccount: p.accountId,
        amount: p.numCoins,
        quizAttemptId: p.quizAttemptId,
      },
      s
    ),
  }));
}

export async function nigeNestCoinGiveAway(p: z.infer<typeof GiveAwayCoinEggSchema>, session?: ClientSession) {
  if (p.amount > GIVEAWAY_LIMITS.COIN) {
    throw new Error(`Exceeded max coin giveaway (${GIVEAWAY_LIMITS.COIN})`);
  }

  const creditAccount = p.accountId;
  // creditAccount should not be treasury, exchange, or pool
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  const pool = await getPoolId();

  if (
    creditAccount.toString() === treasury.toString() ||
    creditAccount.toString() === exchange.toString() ||
    creditAccount.toString() === pool.toString()
  ) {
    throw new Error(`Credit account cannot be treasury, exchange, or pool`);
  }
  await checkAndGetValidNestUserAccount(creditAccount.toString());

  return withTxn(session, async (s) => ({
    [ACTIONS.NEST_COIN_GIVEAWAY]: await recordTransfer(
      {
        assetId: ASSETS.COIN,
        action: ACTIONS.NEST_COIN_GIVEAWAY,
        debitAccount: exchange,
        creditAccount: creditAccount,
        amount: p.amount,
        meta: { giveawayName: p.giveawayName, createdByAccountId: p.createdByAccountId },
      },
      s
    ),
  }));
}

export async function eggGiveawayNest(p: z.infer<typeof GiveAwayCoinEggSchema>, session?: ClientSession) {
  if (p.amount > GIVEAWAY_LIMITS.EGG) {
    throw new Error(`Exceeded max egg giveaway (${GIVEAWAY_LIMITS.EGG})`);
  }

  const creditAccount = p.accountId;
  // creditAccount should not be treasury, exchange, or pool
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  const pool = await getPoolId();

  if (
    creditAccount.toString() === treasury.toString() ||
    creditAccount.toString() === exchange.toString() ||
    creditAccount.toString() === pool.toString()
  ) {
    throw new Error(`Credit account cannot be treasury, exchange, or pool`);
  }
  await checkAndGetValidNestUserAccount(creditAccount.toString());

  return withTxn(session, async (s) => ({
    [ACTIONS.EGG_GIVEAWAY]: await recordTransfer(
      {
        assetId: ASSETS.EGG,
        action: ACTIONS.EGG_GIVEAWAY,
        debitAccount: exchange,
        creditAccount: p.accountId,
        amount: p.amount,
        meta: { giveawayName: p.giveawayName, createdByAccountId: p.createdByAccountId },
      },
      s
    ),
  }));
}

export async function gemGiveawayNest(p: z.infer<typeof GiveAwayGemSchema>, session?: ClientSession) {
  if (p.amount > GIVEAWAY_LIMITS.GEM) {
    throw new Error(`Exceeded max gem giveaway (${GIVEAWAY_LIMITS.GEM})`);
  }
  const creditAccount = p.accountId;
  // creditAccount should not be treasury, exchange, or pool
  const treasury = await getTreasuryId();
  const exchange = await getExchangeId();
  const pool = await getPoolId();

  if (
    creditAccount.toString() === treasury.toString() ||
    creditAccount.toString() === exchange.toString() ||
    creditAccount.toString() === pool.toString()
  ) {
    throw new Error(`Credit account cannot be treasury, exchange, or pool`);
  }
  await checkAndGetValidNestUserAccount(creditAccount.toString());

  return withTxn(session, async (s) => ({
    [ACTIONS.GEM_GIVEAWAY]: await recordTransfer(
      {
        assetId: ASSETS.GEM,
        action: ACTIONS.GEM_GIVEAWAY,
        debitAccount: exchange,
        creditAccount: p.accountId,
        amount: p.amount,
        meta: { giveawayName: p.giveawayName, createdByAccountId: p.createdByAccountId },
      },
      s
    ),
  }));
}
