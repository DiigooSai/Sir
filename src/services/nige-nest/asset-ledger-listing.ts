import { z } from 'zod';
import { Types, type ClientSession } from 'mongoose';
import { withTxn } from './asset-ledger';
import { assetEnum } from '@/db/models/nige-nest/asset';
import { mongoIdZod } from '@/db/common-schemas';
import { ACTIONS, AssetLedgerModel, actionEnumZ, type Action } from '@/db/models/nige-nest/asset-ledger';

export const ListAssetLedgerInputZ = z
  .object({
    assetIds: z.array(assetEnum).default([]).optional(),
    actions: z.array(actionEnumZ).default([]).optional(),
    debitAccounts: z.array(mongoIdZod).default([]).optional(),
    creditAccounts: z.array(mongoIdZod).default([]).optional(),
  })
  .strict();

export type ListAssetLedgerParams = z.infer<typeof ListAssetLedgerInputZ>;

type FilterOpts = { debitCreditOperator?: 'or' | 'and' };

function buildFilter(params: ListAssetLedgerParams, opts: FilterOpts = {}) {
  const { assetIds = [], actions = [], debitAccounts = [], creditAccounts = [] } = ListAssetLedgerInputZ.parse(params);
  const filter: Record<string, any> = {};

  if (assetIds.length) filter.assetId = { $in: [...new Set(assetIds)] };
  if (actions.length) filter.action = { $in: [...new Set(actions)] };

  const da = [...new Set(debitAccounts)].map((id) => new Types.ObjectId(id));
  const ca = [...new Set(creditAccounts)].map((id) => new Types.ObjectId(id));

  if (da.length && ca.length) {
    if (opts.debitCreditOperator === 'and') {
      filter.debitAccount = { $in: da };
      filter.creditAccount = { $in: ca };
    } else {
      filter.$or = [{ debitAccount: { $in: da } }, { creditAccount: { $in: ca } }];
    }
  } else if (da.length) {
    filter.debitAccount = { $in: da };
  } else if (ca.length) {
    filter.creditAccount = { $in: ca };
  }

  return filter;
}

export async function listAssetLedgers(params: ListAssetLedgerParams, session?: ClientSession) {
  const filter = buildFilter(params);
  return withTxn(session, (s) => AssetLedgerModel.find(filter).sort({ createdAt: -1 }).lean().session(s).exec());
}

export async function listAssetLedgersPaged(
  params: ListAssetLedgerParams,
  page: number,
  pageSize: number,
  session?: ClientSession
): Promise<{ total: number; entries: any[] }> {
  const filter = buildFilter(params);
  const skip = (page - 1) * pageSize;
  const [total, entries] = await Promise.all([
    AssetLedgerModel.countDocuments(filter),
    AssetLedgerModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean().exec(),
  ]);
  return { total, entries };
}

export async function listAllLedgersForUserPaged(accountId: string, page: number, pageSize: number): Promise<{ total: number; entries: any[] }> {
  mongoIdZod.parse(accountId);
  return listAssetLedgersPaged({ debitAccounts: [accountId], creditAccounts: [accountId] }, page, pageSize);
}

export async function listUserBreakAndSellGemLedgersPaged(
  accountId: string,
  page: number,
  pageSize: number
): Promise<{ total: number; entries: any[] }> {
  mongoIdZod.parse(accountId);
  return listAssetLedgersPaged(
    {
      actions: [ACTIONS.BREAK_EGG_TO_GEM, ACTIONS.BREAKED_GEM_FROM_EGG, ACTIONS.SELL_GEM_INTENT, ACTIONS.SELL_GEM_APPROVE, ACTIONS.SELL_GEM_REJECT],
      debitAccounts: [accountId],
      creditAccounts: [accountId],
    },
    page,
    pageSize
  );
}

export async function listUserEggPurchaseAndConvertLedgersPaged(
  accountId: string,
  page: number,
  pageSize: number
): Promise<{ total: number; entries: any[] }> {
  mongoIdZod.parse(accountId);
  return listAssetLedgersPaged(
    {
      actions: [ACTIONS.BUY_EGG, ACTIONS.CONVERT_GEM_TO_EGG, ACTIONS.CONVERTED_EGG_FROM_GEM],
      debitAccounts: [accountId],
      creditAccounts: [accountId],
    },
    page,
    pageSize
  );
}
