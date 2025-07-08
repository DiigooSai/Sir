import { RoleModel } from '@/db/models';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';

export async function getAllRolesInternalController(c: Context) {
  const roles = await RoleModel.find({ _id: { $nin: ['ecosystem:superAdmin', 'ecosystem:treasury'] }, isInternal: true }).lean();
  return c.json(new ApiResponse(200, roles), 200);
}

export async function getAllRolesExternalController(c: Context) {
  const roles = await RoleModel.find({ _id: { $nin: [] }, isInternal: true }).lean();
  return c.json(new ApiResponse(200, roles), 200);
}
