import type { Context } from 'hono';
import { LedgerModel, type ILedger } from '@/db/models/ledger';
import { ApiResponse } from '@/utils/ApiResponse';
import { Types } from 'mongoose';

export async function getLedgerHistory(c: Context) {
  const { page = '1', pageSize = '50', debitAccount, creditAccount, dateFrom, dateTo, type } = c.req.query();

  const filter: Record<string, any> = {};

  // Only add the filter if it’s a valid 24-hex – otherwise ignore
  if (debitAccount && Types.ObjectId.isValid(debitAccount)) {
    filter.debitAccount = new Types.ObjectId(debitAccount);
  } else if (debitAccount === 'null') {
    filter.debitAccount = null;
  }

  if (creditAccount && Types.ObjectId.isValid(creditAccount)) {
    filter.creditAccount = new Types.ObjectId(creditAccount);
  } else if (creditAccount === 'null') {
    filter.creditAccount = null;
  }

  if (type) {
    filter.type = type;
  }
  if (dateFrom || dateTo) {
    filter.timestamp = {};
    if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
    if (dateTo) filter.timestamp.$lte = new Date(dateTo);
  }

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const ps = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 500);

  const skip = (pg - 1) * ps;
  const [total, entries] = await Promise.all([
    LedgerModel.countDocuments(filter),
    LedgerModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(ps)
      .select('_id debitAccount creditAccount amount type meta createdAt')
      .lean<ILedger[]>(),
  ]);

  const totalPages = Math.ceil(total / ps);
  return c.json(
    new ApiResponse(200, {
      entries,
      meta: { total, page: pg, pageSize: ps, totalPages },
    })
  );
}
