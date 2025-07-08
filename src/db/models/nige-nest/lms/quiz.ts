import { createSchema, createModel } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema } from 'mongoose';
import { z } from 'zod';

// ─── Question + Option ───────────────────────────────────────────────
const OptionZ = z.string().min(3);
const QuestionZ = z
  .object({
    prompt: z.string().min(3),
    options: z.array(OptionZ).min(2).max(4),
    correctIndex: z.number().int().min(0).max(3),
  })
  .strict();

export type QuizQuestion = z.infer<typeof QuestionZ>;

// ─── Quiz schema ──────────────────────────────────────────────────
export const NestQuizZ = z
  .object({
    chapterId: mongoIdZod,
    durationSec: z.number().int().min(10),
    reward50: z.number().int().min(0).default(0),
    reward100: z.number().int().min(0).default(0),
    questions: z.array(QuestionZ).min(1),
    shouldStopRewarding: z.boolean().default(false),
  })
  .strict();

export type INestQuiz = z.infer<typeof NestQuizZ>;

const QuestionSchema = new Schema<QuizQuestion>(
  {
    prompt: { type: String, required: true, minlength: 3 },
    options: { type: [String], required: true, minlength: 2, maxlength: 4 },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
  },
  { _id: false }
);

const QuizSchema = createSchema<INestQuiz>({
  chapterId: { type: Schema.Types.ObjectId, ref: 'NestChapter', required: true },
  durationSec: { type: Number, required: true, min: 10 },
  reward50: { type: Number, required: true, min: 0, default: 0 },
  reward100: { type: Number, required: true, min: 0, default: 0 },
  questions: { type: [QuestionSchema], required: true },
  shouldStopRewarding: { type: Boolean, default: false },
});

export const UpdateQuizInput = NestQuizZ.pick({ durationSec: true, questions: true, reward50: true, reward100: true }) // cannot change chapter
  .strict();

export type UpdateQuizDTO = z.infer<typeof UpdateQuizInput>;

QuizSchema.index({ chapterId: 1, archivedAt: 1 }, { unique: true, partialFilterExpression: { archivedAt: null } });

export const NestQuizModel = createModel<INestQuiz>('NestQuiz', QuizSchema);
