import { createSchema, createModel } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema } from 'mongoose';
import { z } from 'zod';

export const NestChapterZ = z
  .object({
    courseId: mongoIdZod,
    heading: z.string().min(3),
    content: z.string().optional(),
    thumbnailUrl: z.string().url().optional(),
    ytVideos: z.array(z.string().url()).optional(),
  })
  .strict();

export const UpdateChapterInput = NestChapterZ.pick({
  heading: true,
  content: true,
  thumbnailUrl: true,
  ytVideos: true,
}).strict();
export type UpdateChapterDTO = z.infer<typeof UpdateChapterInput>;

export type INestChapter = z.infer<typeof NestChapterZ>;

const ChapterSchema = createSchema<INestChapter>({
  courseId: { type: Schema.Types.ObjectId, ref: 'NestCourse', required: true },
  heading: { type: String, required: true, minlength: 3 },
  content: { type: String, default: null },
  thumbnailUrl: { type: String, default: null },
  ytVideos: { type: [String], default: [] },
});

export const NestChapterModel = createModel<INestChapter>('NestChapter', ChapterSchema);
