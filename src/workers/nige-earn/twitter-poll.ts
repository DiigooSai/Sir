import { Worker } from 'bullmq';
import fs from 'fs/promises';
import { fetchLikes } from './twitter-http';
import { enqueueLike } from './handlers/like';
import { redisClient } from '@/db/redis';

const OFFICIAL = process.env.NIGECOIN_TWITTER_USER_ID!;

/**
 * Triggered every minute by the “pollMainQueue” job.
 * All calls now use native Axios → v2 REST endpoints.
 * Follow / notification-opt-in are NO-OP (require webhooks).
 */
export const pollWorker = new Worker(
  'pollMainQueue',
  async () => {
    /* 1️⃣ Likes */
    {
      const since = await redisClient.get('since:like');
      try {
        const resp = await fetchLikes(OFFICIAL, since ?? undefined);
        console.log('fetchLikes response: ', resp);
        const tweets = resp.data.data ?? [];
        for (const t of tweets) {
          enqueueLike({
            userId: t.author_id!,
            tweetId: t.id,
            tweetCreatedAt: t.created_at!,
          });
        }
        if (resp.data.meta?.newest_id) {
          await redisClient.set('since:like', resp.data.meta.newest_id);
        }
      } catch (err: any) {
        console.log(err);
        await fs.writeFile('fetch-like-err.txt', JSON.stringify(err, null, 2));
      }
    }

    /* 2️⃣ Bookmarks */
    // {
    //   const since = await redisClient.get('since:bookmark');
    //   const resp = await fetchBookmarks(OFFICIAL, since ?? undefined);
    //   const tweets = resp.data.data ?? [];
    //   for (const t of tweets) {
    //     enqueueBookmark({
    //       userId: t.author_id!,
    //       tweetId: t.id,
    //       tweetCreatedAt: t.created_at!,
    //     });
    //   }
    //   if (resp.data.meta?.newest_id) {
    //     await redisClient.set('since:bookmark', resp.data.meta.newest_id);
    //   }
    // }

    /* 3️⃣ Retweets */
    // {
    //   const tracked = await redisClient.smembers('tracked:tweets');
    //   for (const origId of tracked) {
    //     const since = await redisClient.get(`since:retweet:${origId}`);
    //     const resp = await fetchRetweeters(origId, since ?? undefined);
    //     const users = resp.data.data ?? [];
    //     for (const u of users) {
    //       enqueueRetweet({
    //         userId: u.id,
    //         tweetId: origId,
    //         tweetCreatedAt: new Date().toISOString(),
    //       });
    //     }
    //     if (resp.data.meta?.newest_id) {
    //       await redisClient.set(`since:retweet:${origId}`, resp.data.meta.newest_id);
    //     }
    //   }
    // }

    /* 4️⃣ Quote-tweets */
    // {
    //   const tracked = await redisClient.smembers('tracked:tweets');
    //   for (const origId of tracked) {
    //     const since = await redisClient.get(`since:quote:${origId}`);
    //     const resp = await fetchQuoteTweets(origId, since ?? undefined);
    //     const tweets = resp.data.data ?? [];
    //     for (const t of tweets) {
    //       enqueueQuoteTweet({
    //         userId: t.author_id!,
    //         tweetId: t.id,
    //         tweetCreatedAt: t.created_at!,
    //       });
    //     }
    //     if (resp.data.meta?.newest_id) {
    //       await redisClient.set(`since:quote:${origId}`, resp.data.meta.newest_id);
    //     }
    //   }
    // }

    /* 5-6-9-10-11️⃣ Mentions → Replies / Threads / Hashtags / Cashtags */
    // {
    //   const since = await redisClient.get('since:mention');
    //   const resp = await fetchMentions(OFFICIAL, since ?? undefined);
    //   const tweets = resp.data.data ?? [];
    //   for (const t of tweets) {
    //     // direct reply to @nigecoin
    //     if (t.in_reply_to_user_id === Number(OFFICIAL)) {
    //       enqueueReply({
    //         userId: t.author_id!,
    //         tweetId: t.id,
    //         parentId: t.conversation_id,
    //         tweetCreatedAt: t.created_at!,
    //       });
    //     }
    //     // nested reply (thread)
    //     else if (t.in_reply_to_user_id) {
    //       enqueueThread({
    //         userId: t.author_id!,
    //         tweetId: t.id,
    //         mainPostId: t.conversation_id,
    //         directReplyId: t.referenced_tweets?.find((r: any) => r.type === 'replied_to')?.id ?? '',
    //         tweetCreatedAt: t.created_at!,
    //       });
    //     }
    //     // hashtags
    //     for (const h of t.entities?.hashtags ?? []) {
    //       enqueueHashtag({
    //         userId: t.author_id!,
    //         tweetId: t.id,
    //         tag: h.tag.toLowerCase(),
    //         tweetCreatedAt: t.created_at!,
    //       });
    //     }
    //     // cashtags
    //     for (const c of t.entities?.cashtags ?? []) {
    //       enqueueCashtag({
    //         userId: t.author_id!,
    //         tweetId: t.id,
    //         tag: c.tag.toUpperCase(),
    //         tweetCreatedAt: t.created_at!,
    //       });
    //     }
    //   }
    //   if (resp.data.meta?.newest_id) {
    //     await redisClient.set('since:mention', resp.data.meta.newest_id);
    //   }
    // }

    // 🚨 “follow” & “notification-opt-in” detection not possible via REST;
    //     must use webhooks/Account Activity API if you need those.
  },
  { connection: redisClient }
);

pollWorker.on('completed', () => console.log('✅ pollMainQueue tick'));
pollWorker.on('failed', (_, err) => console.error('❌ pollMainQueue failed', err));
