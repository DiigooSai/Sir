import { Hono } from 'hono';
import { zJsonValidator } from '@/utils/zValidators';
import { requireSuperAdminAuth } from '@/middlewares';
import { addPromoCodeController, removePromoCodeController } from '@/controllers/nest-nest/influencer-promocode.controller';
import { AddPromoCodeBody, RemovePromoCodeBody } from '@/db/models/nige-nest/nest-promocodes';

export const promoCodeRoutes = new Hono();

promoCodeRoutes.post('/', requireSuperAdminAuth, zJsonValidator(AddPromoCodeBody), addPromoCodeController);
promoCodeRoutes.delete('/', requireSuperAdminAuth, zJsonValidator(RemovePromoCodeBody), removePromoCodeController);
