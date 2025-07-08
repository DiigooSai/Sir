import { createModel, createSchema } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema } from 'mongoose';
import { z } from 'zod';

export const influencerZ = z.object({
  name: z.string().min(1, 'Name is required'),
});
export const CreateInfluencerBody = influencerZ.pick({
  name: true,
});
export const EditInfluencerBody = CreateInfluencerBody.merge(z.object({ influencerId: mongoIdZod }));
export type IInfluencer = z.infer<typeof influencerZ>;

const InfluencerSchema = createSchema<IInfluencer>({
  name: { type: String, required: true, unique: true },
});

export const InfluencerModel = createModel<IInfluencer>('Influencer', InfluencerSchema);
