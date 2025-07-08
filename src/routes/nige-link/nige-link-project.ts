import { createProjectController, getBudgetRanges, updateProjectController } from '@/controllers/nige-link/nige-link-project.controller';
import { zodIdSchema } from '@/db/common-schemas';
import { nigeLinkProjectCreateSchema, nigeLinkProjectUpdateSchema } from '@/db/models/nige-link/nige-link-project';
import { requireContractorAuth } from '@/middlewares';
import { zJsonValidator, zParamsValidator } from '@/utils/zValidators';
import { Hono } from 'hono';

export const nigeLinkProjectsRouter = new Hono();

nigeLinkProjectsRouter.get('/budget-ranges', getBudgetRanges);
nigeLinkProjectsRouter.post('/', requireContractorAuth, zJsonValidator(nigeLinkProjectCreateSchema), createProjectController);
nigeLinkProjectsRouter.patch(
  '/:_id',
  requireContractorAuth,
  zParamsValidator(zodIdSchema),
  zJsonValidator(nigeLinkProjectUpdateSchema),
  updateProjectController
);
