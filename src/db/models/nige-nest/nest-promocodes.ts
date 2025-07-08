import { createModel, createSchema } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema } from 'mongoose';
import { z } from 'zod';

export const nestPromoCodeZ = z.object({
  code: z.string().nullable(),
  influencerId: z.string().min(1, 'Influencer ID is required'),
});
export const AddPromoCodeBody = nestPromoCodeZ.pick({
  influencerId: true,
  code: true,
});
export const RemovePromoCodeBody = z.object({
  promoCodeId: mongoIdZod,
});
export type INestPromoCode = {
  code: string;
  influencer: Schema.Types.ObjectId;
};

const NestPromoCodeSchema = createSchema<INestPromoCode>({
  code: { type: String, required: true, unique: true },
  influencer: { type: Schema.Types.ObjectId, ref: 'Influencer', required: true },
});

// enforce unique code per influencer (though code is globally unique already)
NestPromoCodeSchema.index({ influencer: 1, code: 1 }, { unique: true, name: 'unique_influencer_code' });

export const NestPromoCodeModel = createModel<INestPromoCode>('NestPromoCode', NestPromoCodeSchema);
