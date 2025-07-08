import { Document, type ClientSession } from 'mongoose';
import { createModel, createSchema } from '../base';
import { DEFAULT_REWARD_SETTINGS } from '@/configs/nige-earn-admin/rewardSettings.config';

/**
 * One‐row “singleton” document that carries every tunable
 * variable for the Nige‐Earn reward system.
 */
export interface IRewardSettings {
  maxMainPosts: number;
  likeReward: number;
  bookmarkReward: number;
  quoteTweetReward: number;
  repostReward: number;
  replyReward: number;
  replyLimit: number;
  maxThreads: number;
  mentions: { tag: string; reward: number }[];
  hashtags: { tag: string; reward: number }[];
  cashtags: { tag: string; reward: number }[];
  dailyLimit: number;
  followReward: number;
  notificationReward: number;
  rewardStartDate: Date | null;
  whitelistedTweetIds: string[];
}

/** Mongoose Document + our interface */
export type RewardSettingsDocument = Document & IRewardSettings;

const RewardSettingsSchema = createSchema<IRewardSettings>(
  {
    maxMainPosts: { type: Number, default: DEFAULT_REWARD_SETTINGS.maxMainPosts },
    likeReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.likeReward },
    bookmarkReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.bookmarkReward },
    quoteTweetReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.quoteTweetReward },
    repostReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.repostReward },
    replyReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.replyReward },
    replyLimit: { type: Number, default: DEFAULT_REWARD_SETTINGS.replyLimit },
    maxThreads: { type: Number, default: DEFAULT_REWARD_SETTINGS.maxThreads },
    mentions: { type: [{ tag: String, reward: Number }], default: DEFAULT_REWARD_SETTINGS.mentions },
    hashtags: { type: [{ tag: String, reward: Number }], default: DEFAULT_REWARD_SETTINGS.hashtags },
    cashtags: { type: [{ tag: String, reward: Number }], default: DEFAULT_REWARD_SETTINGS.cashtags },
    dailyLimit: { type: Number, default: DEFAULT_REWARD_SETTINGS.dailyLimit },
    followReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.followReward },
    notificationReward: { type: Number, default: DEFAULT_REWARD_SETTINGS.notificationReward },
    rewardStartDate: { type: Date, default: DEFAULT_REWARD_SETTINGS.rewardStartDate },
    whitelistedTweetIds: { type: [String], default: DEFAULT_REWARD_SETTINGS.whitelistedTweetIds },
  }
  // ← removed `{ _id: false }`
);

export const RewardSettingsModel = createModel<RewardSettingsDocument>('RewardSettings', RewardSettingsSchema);

/** Ensure the one‐and‐only settings doc always exists */
export async function ensureRewardSettings(session?: ClientSession): Promise<RewardSettingsDocument> {
  const query = RewardSettingsModel.findOne();
  if (session) query.session(session);
  const existing = await query;

  if (existing) {
    return existing;
  }

  // Create a fresh one
  if (session) {
    // create(docs, options)
    return RewardSettingsModel.create(
      [
        {
          /* no fields => defaults will apply */
        },
      ],
      { session }
    ).then((docs) => docs[0]);
  } else {
    return RewardSettingsModel.create({});
  }
}
