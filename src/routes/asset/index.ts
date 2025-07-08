import { AssetModel } from '@/db/models/nige-nest/asset';
import { ApiResponse } from '@/utils/ApiResponse';
import { zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const assetRouter = new Hono();

assetRouter.get(
  '/:assetId',
  zParamsValidator(
    z.object({
      assetId: z.string().min(1),
    })
  ),
  async (c) => {
    const { assetId } = c.req.param();
    const asset = await AssetModel.findById(assetId).select('rateInUSDT').lean();
    if (!asset) {
      return c.json(new ApiResponse(404, null, 'Asset not found'), 404);
    }
    return c.json(new ApiResponse(200, asset, 'Asset fetched successfully'));
  }
);
