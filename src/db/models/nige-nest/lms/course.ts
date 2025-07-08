import { createSchema, createModel } from '@/db/base';
import { z } from 'zod';

const DIFFICULTIES = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const;
const difficulties = [DIFFICULTIES.EASY, DIFFICULTIES.MEDIUM, DIFFICULTIES.HARD] as const;
export const difficultyEnum = z.enum(difficulties);

export const nestCourseZ = z
  .object({
    title: z.string().min(3),
    description: z.string().optional(),
    thumbnailUrl: z.string().url().optional(),
    difficulty: difficultyEnum,
  })
  .strict();

export const UpdateCourseInput = nestCourseZ
  .pick({
    title: true,
    description: true,
    thumbnailUrl: true,
    difficulty: true,
  })
  .strict();

export type UpdateCourseDTO = z.infer<typeof UpdateCourseInput>;

export type INestCourse = z.infer<typeof nestCourseZ>;

const CourseSchema = createSchema<INestCourse>({
  title: { type: String, required: true, minlength: 3 },
  description: { type: String, default: null },
  thumbnailUrl: { type: String, default: null },
  difficulty: { type: String, enum: difficultyEnum.options, required: true },
});

export const NestCourseModel = createModel<INestCourse>('NestCourse', CourseSchema);
