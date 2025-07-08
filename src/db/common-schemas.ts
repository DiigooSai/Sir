import { Types } from 'mongoose';
import { z } from 'zod';

export const mongoIdZod = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, { message: 'Invalid ID format' });
export const zodIdSchema = z.object({
  _id: mongoIdZod,
});

export const gemAmountZ = z
  .number()
  .positive()
  .refine((v) => Number.isFinite(v) && /^\d+(\.\d{1,2})?$/.test(v.toString()), {
    message: 'Amount must be a decimal up to 2 places',
  });
export const promoCodeZ = z.string().min(6, 'Promo code is required');
// Reusable OTP Validation Schema
export const otpZodSchema = z
  .string()
  .length(6, { message: 'OTP must be exactly 6 characters' }) // Ensure OTP is exactly 6 characters
  .regex(/^\d{6}$/, { message: 'OTP must be numeric' }); // Ensure OTP is numeric

export const opinionDistributionSchema = z
  .object({
    opinionId: z.string().min(1, 'Opinion ID is required'),
    userIds: z.array(z.string()).optional(),
    locationIds: z.array(z.string()).optional(),
    forceRefresh: z.boolean().optional(), // New field for force cache refresh
  })
  .superRefine((data, ctx) => {
    // Check if both arrays are provided and not empty
    if (data.userIds && data.userIds.length > 0 && data.locationIds && data.locationIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Only one of user IDs or location IDs can be provided at a time.',
      });
    }
  });
export const adminLoginZodSchema = z
  .object({
    email: z.string().email({ message: 'Invalid email format' }),
    otp: z.string().length(6, { message: 'OTP must be 6 digits' }),
    otpExpiresAt: z.date(),
  })
  .strict();
export const adminLoginInputSchema = adminLoginZodSchema.pick({
  email: true,
});

export const dateSchema = z.preprocess((arg) => {
  if (typeof arg === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      return new Date(arg + 'T00:00:00');
    }
    const d = new Date(arg);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (arg instanceof Date) {
    return isNaN(arg.getTime()) ? undefined : arg;
  }
  return undefined;
}, z.date().optional());

// Reusable preprocessor for ObjectId or "null"
export const idOrNull = z.preprocess((raw) => {
  if (typeof raw !== 'string') return undefined;
  if (raw === 'null') return raw;
  return Types.ObjectId.isValid(raw) ? raw : undefined;
}, z.string().optional());

export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .refine((n) => n > 0, { message: 'page must be ≥ 1' }),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 50))
    .refine((n) => n > 0 && n <= 500, {
      message: 'pageSize must be between 1 and 500',
    }),
});
