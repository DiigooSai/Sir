import { Hono } from 'hono';
import { zJsonValidator, zParamsValidator } from '@/utils/zValidators';
import { requireSuperAdminAuth } from '@/middlewares';
import {
  createInfluencerController,
  editInfluencerController,
  getAllInfluencersController,
  getInfluencerByIdController,
} from '@/controllers/nest-nest/influencer-promocode.controller';
import { CreateInfluencerBody, EditInfluencerBody } from '@/db/models/nige-nest/influencers';
import { z } from 'zod';
import { mongoIdZod } from '@/db/common-schemas';

export const influencerRoutes = new Hono();

influencerRoutes.post('/', requireSuperAdminAuth, zJsonValidator(CreateInfluencerBody), createInfluencerController);
influencerRoutes.patch('/', requireSuperAdminAuth, zJsonValidator(EditInfluencerBody), editInfluencerController);
influencerRoutes.get('/', requireSuperAdminAuth, getAllInfluencersController);
influencerRoutes.get('/:influencerId', requireSuperAdminAuth, zParamsValidator(z.object({ influencerId: mongoIdZod })), getInfluencerByIdController);
