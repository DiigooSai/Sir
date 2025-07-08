import { createModel, createSchema } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';
import { Schema, Types } from 'mongoose';
import { z } from 'zod';

export const NEST_ISSUE_TYPES = {
  END: 'end',
  COOLDOWN: 'cooldown',
  ARCHIVING: 'archiving',
} as const;

export const nestIssues = [NEST_ISSUE_TYPES.END, NEST_ISSUE_TYPES.COOLDOWN, NEST_ISSUE_TYPES.ARCHIVING] as const;
export const nestIssueEnum = z.enum(nestIssues);
export type NestIssueType = z.infer<typeof nestIssueEnum>;

export const NestIssueZ = z
  .object({
    nestId: mongoIdZod,
    issue: nestIssueEnum,
    message: z.string().min(1, 'Message is required'),
    isResolved: z.boolean().default(false),
  })
  .strict();

export interface INestIssue {
  nestId: Types.ObjectId;
  issue: NestIssueType;
  message: string;
  isResolved: boolean;
}

const NestIssueSchema = createSchema<INestIssue>({
  nestId: {
    type: Schema.Types.ObjectId,
    ref: 'Nest',
    required: true,
  },
  issue: {
    type: String,
    enum: nestIssueEnum.options,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isResolved: {
    type: Boolean,
    required: true,
    default: false,
  },
});

// Index by nest for quick lookup
NestIssueSchema.index({ nestId: 1 });

export const NestIssueModel = createModel<INestIssue>('NestIssue', NestIssueSchema);
