import { createModel, createSchema, type IBaseDocument } from '@/db/base';
import { z } from 'zod';

export const nestAvatarZodSchema = z.object({
  _id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, { message: 'Name is required' }),
  imageUrl: z.string().url({ message: 'Image URL must be a valid URL' }),
});

export const nestAvatarCreateSchema = nestAvatarZodSchema.pick({
  _id: true,
  name: true,
  imageUrl: true,
});

export type INestAvatar = z.infer<typeof nestAvatarZodSchema> & IBaseDocument;

const nestAvatarSchema = createSchema<INestAvatar>({
  _id: { type: String, required: true }, // now a string, unique by default
  name: { type: String, required: true, unique: true },
  imageUrl: { type: String, required: true },
});

export const NestAvatarModel = createModel<INestAvatar>('NestAvatar', nestAvatarSchema);
