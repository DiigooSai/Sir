import type { IRewardSettings } from '@/db/models/reward-settings';

export const DEFAULT_REWARD_SETTINGS: IRewardSettings = {
  maxMainPosts: 10,
  likeReward: 2,
  bookmarkReward: 3,
  quoteTweetReward: 5,
  repostReward: 4,
  replyReward: 1,
  replyLimit: 5,
  maxThreads: 2,
  mentions: [
    {
      tag: 'nigecoin',
      reward: 2,
    },
  ],
  hashtags: [
    {
      tag: 'nige',
      reward: 2,
    },
  ],
  cashtags: [
    {
      tag: 'nigecn',
      reward: 2,
    },
  ],
  dailyLimit: 5,
  followReward: 10,
  notificationReward: 5,
  rewardStartDate: null,
  whitelistedTweetIds: [],
};
