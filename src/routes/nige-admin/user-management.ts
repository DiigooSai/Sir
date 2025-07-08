import {
  createInternalCredentials,
  deleteInternalCredentials,
  editInternalCredentials,
  getAllAccountsController,
  getOneInternalCredentialsController,
} from '@/controllers/nige-admin/user-management.controller';
import { mongoIdZod, PaginationSchema, zodIdSchema } from '@/db/common-schemas';
import { InternalCredentialsCreateSchema, InternalCredentialsUpdateSchema } from '@/db/models/internal-credentials';
import { requireSuperAdminAuth } from '@/middlewares';
import { zJsonValidator, zParamsValidator, zQueryValidator } from '@/utils/zValidators';
import { Hono } from 'hono';
import { z } from 'zod';

export const userManagementRoutes = new Hono();

// getAllAccounts
userManagementRoutes.get(
  '/all-accounts',
  requireSuperAdminAuth,
  zQueryValidator(PaginationSchema.merge(z.object({ isInternal: z.coerce.boolean().optional() }))),
  getAllAccountsController
);
const internalCredentialsRouter = new Hono();

internalCredentialsRouter.get('/:_id', requireSuperAdminAuth, zParamsValidator(zodIdSchema), getOneInternalCredentialsController);
internalCredentialsRouter.post('/', requireSuperAdminAuth, zJsonValidator(InternalCredentialsCreateSchema), createInternalCredentials);
internalCredentialsRouter.patch(
  '/:_id',
  requireSuperAdminAuth,
  zParamsValidator(zodIdSchema),
  zJsonValidator(InternalCredentialsUpdateSchema),
  editInternalCredentials
);
internalCredentialsRouter.delete('/:_id', requireSuperAdminAuth, zParamsValidator(zodIdSchema), deleteInternalCredentials);

userManagementRoutes.route('/internal-credentials', internalCredentialsRouter);
