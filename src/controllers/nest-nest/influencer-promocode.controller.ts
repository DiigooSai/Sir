import { CreateInfluencerBody, EditInfluencerBody } from '@/db/models/nige-nest/influencers';
import { AddPromoCodeBody, RemovePromoCodeBody } from '@/db/models/nige-nest/nest-promocodes';
import {
  addPromoCode,
  createInfluencer,
  getAllInfluencers,
  getInfluencerById,
  removePromoCode,
  updateInfluencer,
} from '@/services/nige-nest/influencer-promocode';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';
import type { z } from 'zod';

export async function createInfluencerController(c: Context) {
  const { name } = (await c.req.json()) as z.infer<typeof CreateInfluencerBody>;
  const influencer = await createInfluencer({ name });
  return c.json(new ApiResponse(201, influencer, 'Influencer created'), 201);
}

export async function editInfluencerController(c: Context) {
  const { name, influencerId } = (await c.req.json()) as z.infer<typeof EditInfluencerBody>;
  const inf = await updateInfluencer({ influencerId, name });
  return c.json(new ApiResponse(200, inf, 'Influencer updated'), 200);
}

export async function getAllInfluencersController(c: Context) {
  const list = await getAllInfluencers();
  return c.json(new ApiResponse(200, list, 'Influencers fetched'), 200);
}

export async function getInfluencerByIdController(c: Context) {
  const { influencerId } = c.req.param();
  const inf = await getInfluencerById({ influencerId });
  return c.json(new ApiResponse(200, inf, 'Influencer fetched'), 200);
}

export async function addPromoCodeController(c: Context) {
  const { influencerId, code } = (await c.req.json()) as z.infer<typeof AddPromoCodeBody>;
  const promo = await addPromoCode({ influencerId, code });
  return c.json(new ApiResponse(201, promo, 'Promo code added'), 201);
}

export async function removePromoCodeController(c: Context) {
  const { promoCodeId } = (await c.req.json()) as z.infer<typeof RemovePromoCodeBody>;
  await removePromoCode({ promoCodeId });
  return c.json(new ApiResponse(200, {}, 'Promo code removed'), 200);
}
