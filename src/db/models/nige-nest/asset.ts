import { createSchema, createModel } from '@/db/base';
import { z } from 'zod';

export const ASSETS = {
  COIN: 'coin',
  EGG: 'egg',
  GEM: 'gem',
} as const;

const assets = [ASSETS.COIN, ASSETS.EGG, ASSETS.GEM] as const;
export const assetEnum = z.enum(assets);
export type AssetType = z.infer<typeof assetEnum>;

export interface IAsset {
  _id: AssetType; // primary key
  rateInUSDT: number; // ≥ 0
}

const AssetSchema = createSchema<IAsset>({
  _id: { type: String, enum: assetEnum.options, required: true },
  rateInUSDT: { type: Number, min: 0, required: true },
});

export const AssetModel = createModel<IAsset>('Asset', AssetSchema);
