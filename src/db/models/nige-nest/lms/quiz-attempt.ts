import { createSchema, createModel } from '@/db/base';
import { Schema } from 'mongoose';
import { z } from 'zod';

export const NestAttemptZ = z
  .object({
    quizId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    accountId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    answers: z.array(z.number().int().min(0).max(3)),
    startAt: z.date(),
    expiresAt: z.date(),
    submittedAt: z.date().nullable(),
    score: z.number().int().min(0),
    comments: z.array(z.string()).default([]),
    attemptCount: z.number().int().min(0),
    quizSnapshot: z.any(),
  })
  .strict();

export type INestQuizAttempt = z.infer<typeof NestAttemptZ>;

const AttemptSchema = createSchema<INestQuizAttempt>({
  quizId: { type: Schema.Types.ObjectId, ref: 'NestQuiz', required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  answers: { type: [Number], required: true },
  startAt: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  submittedAt: { type: Date, default: null },
  score: { type: Number, required: true },
  comments: { type: [String], default: [] },
  attemptCount: { type: Number, required: true },
  quizSnapshot: { type: Object, required: true },
});

AttemptSchema.index({ quizId: 1, accountId: 1 });

export const NestQuizAttemptModel = createModel<INestQuizAttempt>('NestQuizAttempt', AttemptSchema);
