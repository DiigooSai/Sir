import type { INestChapter, UpdateChapterDTO } from '@/db/models/nige-nest/lms/chapter';
import { archiveChapter, createChapter, updateChapter } from '@/services/nige-nest/lms/chapter';
import { getChapterById } from '@/services/nige-nest/lms/get-services';
import { ApiResponse } from '@/utils/ApiResponse';
import type { Context } from 'hono';

// param schema: z.object({ chapterId: mongoIdZod })
export async function getChapterByIdAdminController(c: Context) {
  const { _id } = c.req.param();
  const { chapter, doesQuizExist } = await getChapterById(_id, { includeArchived: true });
  return c.json(new ApiResponse(200, { chapter, doesQuizExist }, 'Chapter details fetched successfully'));
}

export async function createChapterController(c: Context) {
  const { courseId }: Pick<INestChapter, 'courseId'> = c.req.param();
  const { heading, content, thumbnailUrl }: Pick<INestChapter, 'heading' | 'content' | 'thumbnailUrl'> = await c.req.json();
  const course = await createChapter({
    courseId,
    heading,
    content,
    thumbnailUrl,
  });
  return c.json(new ApiResponse(201, course, 'Chapter created successfully'), 201);
}

export async function updateChapterController(c: Context) {
  const { chapterId } = c.req.param();
  const { heading, content, thumbnailUrl } = (await c.req.json()) as UpdateChapterDTO;
  const updated = await updateChapter(chapterId, { heading, content, thumbnailUrl });
  return c.json(new ApiResponse(200, updated, 'Chapter updated successfully'));
}

export async function archiveChapterController(c: Context) {
  const { chapterId } = await c.req.json();
  await archiveChapter(chapterId);
  return c.json(new ApiResponse(200, null, 'Chapter archived successfully'));
}
