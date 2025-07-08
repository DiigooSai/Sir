import { z } from 'zod';
import { Document } from 'mongoose';
import { budgetEnum, type BudgetEnum } from '@/constants/budget-ranges';
import { createModel, createSchema, type IBaseDocument } from '@/db/base';
import { mongoIdZod } from '@/db/common-schemas';

// Zod enum for status
const nigeLinkProjectStatus = z.enum(['draft', 'live', 'ongoing', 'completed', 'cancelled', 'abandoned']);

export const nigeLinkProjectZodSchema = z
  .object({
    name: z.string().trim().min(3, 'Name must be at least 3 characters').max(100, 'Name must be at most 100 characters'),
    budget: budgetEnum,
    projectDescription: z
      .string()
      .trim()
      .min(250, 'Project description must be at least 250 characters')
      .max(10000, 'Project description must be at most 10000 characters'),
    status: nigeLinkProjectStatus,
    contractorAccountId: mongoIdZod,
    freelancerAccountId: mongoIdZod.optional(),
  })
  .strict();
// .refine((data) => !(data.contractorAccountId && data.freelancerAccountId && data.contractorAccountId === data.freelancerAccountId), {
//   message: 'Contractor and freelancer account IDs cannot be the same',
//   path: ['freelancerAccountId'], // highlight the field in the error
// });

// TS interface for Mongo documents
export type INigeLinkProject = z.infer<typeof nigeLinkProjectZodSchema> & IBaseDocument;

// Zod schema (for request validation)
export const nigeLinkProjectCreateSchema = nigeLinkProjectZodSchema
  .pick({
    name: true,
    budget: true,
    projectDescription: true,
  })
  .strict();

export const nigeLinkProjectUpdateSchema = nigeLinkProjectCreateSchema.strict().partial();

// Mongoose schema
const NigeLinkProjectSchema = createSchema<INigeLinkProject>({
  name: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 100,
  },
  budget: {
    type: String,
    enum: budgetEnum.options,
    required: true,
  },
  projectDescription: {
    type: String,
    required: true,
    minlength: 250,
    maxlength: 10000,
  },
  status: {
    type: String,
    enum: nigeLinkProjectStatus.options,
    required: true,
    default: 'draft',
  },
  contractorAccountId: {
    type: String,
    required: true,
    ref: 'Account',
  },
  freelancerAccountId: {
    type: String,
    ref: 'Account',
  },
});

// 1️⃣ Document‐level hook (works in any .save({ session }) call)
NigeLinkProjectSchema.pre('validate', function (this: Document & INigeLinkProject, next) {
  if (this.contractorAccountId && this.freelancerAccountId && this.contractorAccountId === this.freelancerAccountId) {
    return next(new Error('Contractor and freelancer account IDs cannot be the same'));
  }
  next();
});

// 2️⃣ Query‐level hook to cover findOneAndUpdate (and similar queries)
NigeLinkProjectSchema.pre('findOneAndUpdate', async function (this: any, next: (err?: Error) => void) {
  // Extract the in‐flight session (if any) so we can use it in our lookup
  const session = this.getOptions().session;

  const update = this.getUpdate() as Partial<INigeLinkProject>;
  const { contractorAccountId, freelancerAccountId } = update;

  // If both fields are updated simultaneously, compare directly
  if (contractorAccountId && freelancerAccountId && contractorAccountId === freelancerAccountId) {
    return next(new Error('Contractor and freelancer account IDs cannot be the same'));
  }

  // If only one of the two is present in the update, fetch the other from the DB
  if ((contractorAccountId && !freelancerAccountId) || (!contractorAccountId && freelancerAccountId)) {
    // Use the same session so we see uncommitted changes if inside a transaction
    const existing = await this.model.findOne(this.getQuery()).select('contractorAccountId freelancerAccountId').session(session).lean();

    if (existing) {
      const newContractor = contractorAccountId || existing.contractorAccountId;
      const newFreelancer = freelancerAccountId || existing.freelancerAccountId;

      if (newContractor && newFreelancer && newContractor === newFreelancer) {
        return next(new Error('Contractor and freelancer account IDs cannot be the same'));
      }
    }
  }

  next();
});

// 3️⃣ Export the model (with a name of your choosing)
export const NigeLinkProjectModel = createModel<INigeLinkProject>('NigeLinkProject', NigeLinkProjectSchema);
