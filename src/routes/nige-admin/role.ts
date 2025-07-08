import { getAllRolesExternalController, getAllRolesInternalController } from '@/controllers/nige-admin/roles.controller';
import { requireSuperAdminAuth } from '@/middlewares';
import { Hono } from 'hono';

export const roleRoles = new Hono();
roleRoles.get('/all-internal', requireSuperAdminAuth, getAllRolesInternalController);
roleRoles.get('/all-external', requireSuperAdminAuth, getAllRolesExternalController);
