import { createSchema } from '@/db/base';
import { z } from 'zod';
import mongoose, { Document } from 'mongoose';
import { gemAmountZ, mongoIdZod } from '@/db/common-schemas';

export const NEST_RISKS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

const nestRisks = [NEST_RISKS.LOW, NEST_RISKS.MEDIUM, NEST_RISKS.HIGH] as const;
export const nestRiskEnum = z.enum(nestRisks);
export type NestRiskEnum = z.infer<typeof nestRiskEnum>;

const baseNestZ = z.object({
  lastUpdatedByZone: z.string().trim(),
  nestName: z.string().min(3).trim(),
  eggPool: z.number().min(1),
  eggLimitPerPerson: z.number().min(1).nullable(),
  unlockCoins: z.number().min(1),

  scheduledLaunchAt: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'scheduledLaunchAt must be a valid ISO UTC date',
  }),
  launchSchedulerId: z.string().nullable().default(null),
  isLaunched: z.boolean().default(false),

  scheduledNestEnd: z
    .string()

    .refine((val) => val === undefined || !Number.isNaN(Date.parse(val)), { message: 'scheduledNestEnd must be a valid ISO UTC date' }),
  nestEndSchedulerId: z.string().nullable().default(null),
  isNestEnded: z.boolean().default(false),

  scheduledCoolDownEnd: z
    .string()

    .refine((val) => val === undefined || !Number.isNaN(Date.parse(val)), { message: 'scheduledCoolDownEnd must be a valid ISO UTC date' }),
  coolDownSchedulerId: z.string().nullable().default(null),
  isCoolDownEnded: z.boolean().default(false),

  gemReturnMinFactor: gemAmountZ,
  gemReturnMaxFactor: gemAmountZ,
  gemReturnFactor: gemAmountZ.nullable(),

  nestRisk: nestRiskEnum,
  archivedAt: z.date().nullish(),
});

export const nestZ = baseNestZ
  .refine((data) => data.scheduledLaunchAt < data.scheduledNestEnd, {
    message: 'scheduledLaunchAt must be before scheduledNestEnd',
    path: ['scheduledNestEnd'],
  })
  .refine((data) => data.scheduledNestEnd < data.scheduledCoolDownEnd, {
    message: 'scheduledNestEnd must be before scheduledCoolDownEnd',
    path: ['scheduledCoolDownEnd'],
  });

export const createNestZodSchema = baseNestZ
  .pick({
    lastUpdatedByZone: true,
    nestName: true,
    eggPool: true,
    unlockCoins: true,
    scheduledLaunchAt: true,
    scheduledNestEnd: true,
    scheduledCoolDownEnd: true,
    gemReturnMinFactor: true,
    gemReturnMaxFactor: true,
    nestRisk: true,
  })
  .merge(
    baseNestZ.partial({
      gemReturnFactor: true,
      eggLimitPerPerson: true,
    })
  )
  .refine((data) => data.scheduledLaunchAt < data.scheduledNestEnd, {
    message: 'scheduledLaunchAt must be before scheduledNestEnd',
    path: ['scheduledNestEnd'],
  })
  .refine((data) => data.scheduledNestEnd < data.scheduledCoolDownEnd, {
    message: 'scheduledNestEnd must be before scheduledCoolDownEnd',
    path: ['scheduledCoolDownEnd'],
  })
  .refine((data) => data.gemReturnMinFactor <= data.gemReturnMaxFactor, {
    message: 'minfactor must be less than or equal to maxfactor',
    path: ['gemReturnMinFactor', 'gemReturnMaxFactor'],
  });

export const EditNestZodSchema = baseNestZ
  .pick({
    lastUpdatedByZone: true,
    nestName: true,
    eggPool: true,
    unlockCoins: true,
    scheduledLaunchAt: true,
    scheduledNestEnd: true,
    scheduledCoolDownEnd: true,
    gemReturnMinFactor: true,
    gemReturnMaxFactor: true,
    nestRisk: true,
  })
  .merge(
    z.object({
      nestId: mongoIdZod,
    })
  )
  .merge(
    baseNestZ.partial({
      gemReturnFactor: true,
      eggLimitPerPerson: true,
    })
  )
  .refine((data) => data.scheduledLaunchAt < data.scheduledNestEnd, {
    message: 'scheduledLaunchAt must be before scheduledNestEnd',
    path: ['scheduledNestEnd'],
  })
  .refine((data) => data.scheduledNestEnd < data.scheduledCoolDownEnd, {
    message: 'scheduledNestEnd must be before scheduledCoolDownEnd',
    path: ['scheduledCoolDownEnd'],
  })
  .refine((data) => data.gemReturnMinFactor <= data.gemReturnMaxFactor, {
    message: 'minfactor must be less than or equal to maxfactor',
    path: ['gemReturnMinFactor', 'gemReturnMaxFactor'],
  });

export type EditNestDTO = z.infer<typeof EditNestZodSchema>;

export type INestZ = z.infer<typeof nestZ>;

type NestDoc = INestZ & { lastUpdatedBy: string } & Document;
const NestSchema = createSchema<NestDoc>({
  lastUpdatedBy: { type: String, ref: 'Account', required: true },
  lastUpdatedByZone: { type: String, required: true, trim: true },
  nestName: { type: String, required: true, minlength: 3, trim: true },
  eggPool: { type: Number, required: true, min: 0 },
  eggLimitPerPerson: { type: Number, min: 0, default: null },
  unlockCoins: { type: Number, required: true, min: 0 },

  scheduledLaunchAt: { type: Date, required: true }, // ISO UTC
  launchSchedulerId: { type: String, default: null },
  isLaunched: { type: Boolean, default: false },

  scheduledNestEnd: { type: Date, required: true },
  nestEndSchedulerId: { type: String, default: null },
  isNestEnded: { type: Boolean, default: false },

  scheduledCoolDownEnd: { type: Date, required: true },
  coolDownSchedulerId: { type: String, default: null },
  isCoolDownEnded: { type: Boolean, default: false },

  gemReturnMinFactor: {
    type: Number,
    required: true,
    min: [0, 'gemReturnMinFactor cannot be negative'],
    set(v: number) {
      const fixed = Math.round(v * 100) / 100;
      const diff = Math.abs(v - fixed);
      if (diff <= 1e-8) return fixed;
      throw new mongoose.Error.ValidatorError({
        message: 'gemReturnMinFactor can have at most two decimal places',
        path: 'gemReturnMinFactor',
        value: v,
      });
    },
  },
  gemReturnMaxFactor: {
    type: Number,
    required: true,
    min: [0, 'gemReturnMaxFactor cannot be negative'],
    set(v: number) {
      const fixed = Math.round(v * 100) / 100;
      const diff = Math.abs(v - fixed);
      if (diff <= 1e-8) return fixed;
      throw new mongoose.Error.ValidatorError({
        message: 'gemReturnMaxFactor can have at most two decimal places',
        path: 'gemReturnMaxFactor',
        value: v,
      });
    },
  },
  gemReturnFactor: {
    type: Number,
    min: [0, 'gemReturnFactor cannot be negative'],
    set(v: number) {
      const fixed = Math.round(v * 100) / 100;
      const diff = Math.abs(v - fixed);
      if (diff <= 1e-8) return fixed;
      throw new mongoose.Error.ValidatorError({
        message: 'gemReturnFactor can have at most two decimal places',
        path: 'gemReturnFactor',
        value: v,
      });
    },
    default: null,
  },

  nestRisk: { type: String, enum: nestRisks, required: true },

  archivedAt: { type: Date, default: null },
});

NestSchema.pre('validate', function (next) {
  if (!(this.scheduledLaunchAt < this.scheduledNestEnd)) {
    return next(
      new mongoose.Error.ValidationError(
        new mongoose.Error.ValidatorError({
          path: 'scheduledNestEnd',
          message: 'scheduledNestEnd must be after scheduledLaunchAt',
        })
      )
    );
  }
  if (!(this.scheduledNestEnd < this.scheduledCoolDownEnd)) {
    return next(
      new mongoose.Error.ValidationError(
        new mongoose.Error.ValidatorError({
          path: 'scheduledCoolDownEnd',
          message: 'scheduledCoolDownEnd must be after scheduledNestEnd',
        })
      )
    );
  }
  next();
});

export const NestModel = mongoose.model<NestDoc>('Nest', NestSchema);
