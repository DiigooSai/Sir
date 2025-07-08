import { LedgerModel, AccountModel } from '@/db/models';

type Totals = { count: number; amount: number };
const EMPTY: Totals = { count: 0, amount: 0 };

export async function getRewardStats() {
  // 1) Kick off both the big aggregation and the user-count in parallel
  const [aggResults, totalUsers] = await Promise.all([
    LedgerModel.aggregate([
      // only reward entries
      { $match: { type: 'reward' } },
      {
        // facet into four buckets in one go
        $facet: {
          overall: [{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } }],
          byType: [{ $group: { _id: '$meta.type', count: { $sum: 1 }, amount: { $sum: '$amount' } } }],
          hashtagDist: [
            { $match: { 'meta.type': 'hashtag' } },
            { $group: { _id: '$meta.tag', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
            { $project: { _id: 0, tag: '$_id', count: 1, amount: 1 } },
            { $sort: { amount: -1 } },
          ],
          mentionDist: [
            { $match: { 'meta.type': 'mention' } },
            { $group: { _id: '$meta.tag', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
            { $project: { _id: 0, tag: '$_id', count: 1, amount: 1 } },
            { $sort: { amount: -1 } },
          ],
        },
      },
    ]),
    AccountModel.countDocuments({ system: false }),
  ]);

  // 2) Pull out the single facet‐doc, or fall back to empty buckets
  const facet = aggResults[0] ?? {
    overall: [],
    byType: [],
    hashtagDist: [],
    mentionDist: [],
  };

  // 3) Build a map of totals by meta.type
  const byTypeMap: Record<string, Totals> = facet.byType.reduce((acc, cur) => {
    acc[cur._id] = { count: cur.count, amount: cur.amount };
    return acc;
  }, {} as Record<string, Totals>);

  // 4) Helpers to pick off each metric
  const overall: Totals = facet.overall[0] ?? EMPTY;
  const pick = (t: string): Totals => byTypeMap[t] ?? EMPTY;

  // 5) Return the exact same shape as before
  return {
    totalRewardsShared: overall,
    totalUsers,

    hashtagRewards: {
      total: pick('hashtag'),
      distributionByTag: facet.hashtagDist,
    },

    mentionRewards: {
      total: pick('mention'),
      distributionByTag: facet.mentionDist,
    },

    likeRewards: pick('like'),
    replyRewards: pick('reply'),
    quoteRewards: pick('quote'),
    repostRewards: pick('retweet'),
  };
}
