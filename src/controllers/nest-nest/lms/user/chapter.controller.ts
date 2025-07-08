import { getChapterById } from '@/services/nige-nest/lms/get-services';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';

export async function getChapterByIdUserController(c: Context) {
  const { _id } = c.req.param();
  const { chapter, doesQuizExist } = await getChapterById(_id);
  return c.json(new ApiResponse(200, { chapter, doesQuizExist }, 'Chapter details fetched successfully'));
}
