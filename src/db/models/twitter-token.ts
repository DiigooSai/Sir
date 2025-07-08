import { Schema } from 'mongoose';
import { createModel, createSchema } from '../base';

export interface ITwitterToken {
  userId: Schema.Types.ObjectId;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

const TokenSchema = createSchema<ITwitterToken>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

export const TwitterTokenModel = createModel<ITwitterToken>('TwitterToken', TokenSchema);
