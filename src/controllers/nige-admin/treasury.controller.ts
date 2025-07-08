import { z } from 'zod';
import type { Context } from 'hono';
import { ApiResponse } from '@/utils/ApiResponse';
import { mintToTreasury, burnFromTreasury } from '@/services/nige-earn/treasury';
import { AccountModel } from '@/db/models';

export async function mintCoins(c: Context) {
  const { amount } = await c.req.json();
  const result = await mintToTreasury(amount);
  return c.json(new ApiResponse(200, result, 'Coins minted successfully'));
}

export async function burnCoins(c: Context) {
  const { amount } = await c.req.json();
  const result = await burnFromTreasury(amount);
  return c.json(new ApiResponse(200, result, 'Coins burned successfully'));
}

export async function getTreasuryAccount(c: Context) {
  const treasury = await AccountModel.findOne({ system: true }).lean();
  if (!treasury) {
    return c.json(new ApiResponse(404, null, 'Treasury account not found'), 404);
  }

  return c.json(
    new ApiResponse(200, {
      _id: treasury._id.toString(),
      balance: treasury.balance,
    })
  );
}
