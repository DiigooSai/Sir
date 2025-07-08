import type { Context } from 'hono';
import { ApiResponse } from '@/utils/ApiResponse';
import { CONTEXT_STATE } from '@/constants/hono-context';
import { BUDGET_RANGES } from '@/constants/budget-ranges';
import { NigeLinkProjectModel } from '@/db/models/nige-link/nige-link-project';

export async function getBudgetRanges(c: Context) {
  return c.json(new ApiResponse(200, BUDGET_RANGES), 200);
}

export async function createProjectController(c: Context) {
  const { name, budget, projectDescription } = await c.req.json();
  const { accountId: contractorAccountId } = c.get(CONTEXT_STATE.JWT_PAYLOAD) as { accountId: string };

  const project = new NigeLinkProjectModel({
    name,
    budget,
    projectDescription,
    contractorAccountId,
  });
  await project.save();
  return c.json(new ApiResponse(201, project), 201);
}

export async function updateProjectController(c: Context) {
  const { _id } = c.req.param();
  const { name, budget, projectDescription } = await c.req.json();
  const { accountId: contractorAccountId } = c.get(CONTEXT_STATE.JWT_PAYLOAD) as { accountId: string };

  const project = await NigeLinkProjectModel.findById(_id).lean();
  if (!project) {
    return c.json(new ApiResponse(404, null, 'Project not found'), 404);
  }
  if (project.contractorAccountId !== contractorAccountId) {
    return c.json(new ApiResponse(403, null, 'Forbidden'), 403);
  }
  if (project.status !== 'draft') {
    return c.json(new ApiResponse(400, null, 'Project must be in draft'), 400);
  }
  if (budget && !(budget in BUDGET_RANGES)) {
    return c.json(new ApiResponse(400, null, 'Invalid budget'), 400);
  }
  // update only the fields that are provided and not undefined, name, budget and projectDescription can be undefined

  await NigeLinkProjectModel.updateOne(
    { _id },
    { $set: { ...(name ? { name } : {}), ...(budget ? { budget } : {}), ...(projectDescription ? { projectDescription } : {}) } }
  );

  return c.json(new ApiResponse(200, project), 200);
}
