import type { Context } from 'hono';
import { ApiResponse } from '@/utils/ApiResponse';
import { CONTEXT_STATE } from '@/constants/hono-context';
import { LEDGER_TYPES } from '@/constants';
import { LedgerModel, type ILedger } from '@/db/models';
import { Types } from 'mongoose';

export async function getUserActivity(c: Context) {
  // parse & validate pagination
  const { page, pageSize } = c.req.query();
  // extract the current user’s accountId from the JWT
  const accountId = c.get(CONTEXT_STATE.JWT_PAYLOAD).accountId as string;

  // build the Mongo filter
  const filter = {
    type: LEDGER_TYPES.REWARD,
    creditAccount: new Types.ObjectId(accountId),
  };

  // calculate skip
  const skip = (+page - 1) * +pageSize;

  // fetch total count + one page of entries
  const [total, entries] = await Promise.all([
    LedgerModel.countDocuments(filter),
    LedgerModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+pageSize).select('_id amount type meta createdAt').lean<ILedger[]>(),
  ]);

  const totalPages = Math.ceil(total / +pageSize);
  const meta = { total, page, pageSize, totalPages };

  // return entries + pagination meta
  return c.json(new ApiResponse(200, { entries, meta }));
}
