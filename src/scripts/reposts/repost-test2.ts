import { ROLES } from '@/constants';
import { creditUser } from '@/services/nige-earn/ledger';
import { markRewarded } from '@/workers/nige-earn/utils/state-store';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { connectRedis, redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';
import { AccountRoleModel, AuthProviderModel } from '@/db/models';
import { getLogPath } from '../utils';

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface Tweet {
  id: string;
  public_metrics: { retweet_count: number };
  created_at: string;
}

interface TwitterUser {
  id: string;
  username: string;
  name: string;
}

interface TweetsResponse {
  data?: Tweet[];
  meta?: { next_token?: string };
}

interface RetweetersResponse {
  data?: TwitterUser[];
  meta?: { next_token?: string };
}

// ─── Environment Variables ──────────────────────────────────────────────────
const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN!;
const { MONGO_URI, NIGECOIN_TWITTER_USER_ID: ACCOUNT_ID } = process.env;
if (!MONGO_URI || !ACCOUNT_ID) {
  console.error('❌ Missing MONGO_URI or NIGECOIN_TWITTER_USER_ID');
  process.exit(1);
}

// ─── Config ─────────────────────────────────────────────────────────────────
const MAX_PAGE_SIZE = 100;
const MAX_TWEETS_PER_RUN = 10;
const RETWEET_HARD_CAP = 2000;
const CALL_DELAY_MS = 300;
const REDIS_TTL_SEC = 3600;
const RUN_ID = `run:${new Date().toISOString().slice(0, 16)}`;
const logPath = getLogPath();

// ─── Logging Setup ──────────────────────────────────────────────────────────
const logDir = path.join(__dirname, logPath);
fs.mkdirSync(logDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `${ts}.log`);
fs.writeFileSync(logFile, '', 'utf-8');

function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n', 'utf-8');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Twitter Client (Bearer Token) ──────────────────────────────────────────
function createTwitterClient(): AxiosInstance {
  const c = axios.create({
    baseURL: 'https://api.twitter.com/2',
    headers: { Authorization: `Bearer ${USER_ACCESS_TOKEN}` },
  });

  c.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (err.response?.status === 429) {
        const reset = Number(err.response.headers['x-rate-limit-reset'] || 0) * 1000;
        const wait = Math.max(reset - Date.now(), 0) + 1000;
        log(`⚠️ Rate limit hit. Sleeping for ${wait / 1000}s`);
        await sleep(wait);
        return c.request(err.config);
      }
      return Promise.reject(err);
    }
  );

  return c;
}

// ─── Retry Wrapper ──────────────────────────────────────────────────────────
async function withRetries<T>(fn: () => Promise<T>, at = 1): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (at < 3) {
      log(`⚠️ Retry #${at}: ${err.message}`);
      await sleep(500 * at);
      return withRetries(fn, at + 1);
    }
    throw err;
  }
}

// ─── Fetch Tweets ───────────────────────────────────────────────────────────
async function getAllTweets(client: AxiosInstance, userId: string): Promise<Tweet[]> {
  const all: Tweet[] = [];
  let next: string | undefined;
  do {
    const res: AxiosResponse<TweetsResponse> = await withRetries(() =>
      client.get(`/users/${userId}/tweets`, {
        params: {
          max_results: MAX_PAGE_SIZE,
          'tweet.fields': 'public_metrics,created_at',
          exclude: 'retweets,replies',
          ...(next ? { pagination_token: next } : {}),
        },
      })
    );
    all.push(...(res.data.data || []));
    next = res.data.meta?.next_token;
    await sleep(CALL_DELAY_MS);
  } while (next && all.length < MAX_TWEETS_PER_RUN);
  return all.slice(0, MAX_TWEETS_PER_RUN);
}

// ─── Fetch Retweeters ───────────────────────────────────────────────────────
async function getRetweeters(client: AxiosInstance, tweetId: string, nextToken?: string): Promise<RetweetersResponse> {
  return await withRetries(() =>
    client.get(`/tweets/${tweetId}/retweeted_by`, {
      params: {
        'user.fields': 'username,name',
        max_results: MAX_PAGE_SIZE,
        ...(nextToken ? { pagination_token: nextToken } : {}),
      },
    })
  );
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
async function main() {
  log('Running reposts script');
  let processed = 0,
    skipped = 0,
    matched = 0,
    credited = 0;
  const errors: string[] = [];

  await connectRedis();
  await mongoose.connect(MONGO_URI!);
  log('✅ MongoDB connected');

  const settings = await fetchSettings();
  const rewardAmt = settings.repostReward;
  if (!rewardAmt) {
    log('⚠️ repostReward not set, exiting.');
    return;
  }

  const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
  const acctIds = roles.map((r) => r.accountId.toString());
  const providers = await AuthProviderModel.find({ provider: 'twitter', accountId: { $in: acctIds } }).lean();
  const registered = new Set(providers.map((p) => p.providerUserId));
  const toAccount = new Map(providers.map((p) => [p.providerUserId, p.accountId.toString()]));

  const client = createTwitterClient();
  log(`📥 Fetching tweets for @${ACCOUNT_ID}`);
  const tweets = await getAllTweets(client, ACCOUNT_ID!);
  log(`✅ ${tweets.length} tweets retrieved`);

  for (const tweet of tweets) {
    const { id: tweetId, public_metrics, created_at } = tweet;
    const retweetCount = public_metrics.retweet_count;

    log(`\n📄 Tweet ${tweetId} @ ${created_at} — retweets: ${retweetCount}`);
    if (retweetCount === 0 || retweetCount > RETWEET_HARD_CAP) {
      log(`— Skipped (retweet count out of range)`);
      skipped++;
      continue;
    }

    // ─── Progress: Resume if available ──────────────────────────────────────
    let pageToken: string | undefined = undefined;
    try {
      const raw = await redisClient.get(`progress:retweet:${tweetId}`);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.runId === RUN_ID) {
          pageToken = cached.nextToken;
          log(`↪️ Resuming pagination for tweet ${tweetId}`);
        } else {
          log(`🆕 New run — starting fresh for tweet ${tweetId}`);
        }
      }
    } catch (err: any) {
      log(`⚠️ Redis GET failed: ${err.message}`);
    }

    while (true) {
      let res: AxiosResponse<RetweetersResponse>;
      try {
        res = await getRetweeters(client, tweetId, pageToken);
      } catch (err: any) {
        log(`✗ Retweeter fetch error: ${err.message}`);
        errors.push(`retweeters(${tweetId})→${err.message}`);
        break;
      }

      const users = res.data.data || [];
      log(`   🔄 Retweeters fetched: ${users.length}`);

      let thisMatch = 0;
      for (const user of users) {
        const { id: userId, username } = user;
        log(`\n👤 Retweeter: @${username} (${userId})`);

        if (!registered.has(userId)) {
          log('— Skipped (not a registered user)');
          continue;
        }

        const rewardKey = `reward:retweet:${userId}:${tweetId}`;
        const alreadyRewarded = !(await markRewarded(rewardKey));
        if (alreadyRewarded) {
          log('🔁 Already rewarded');
          continue;
        }

        try {
          const accountId = toAccount.get(userId)!;
          await creditUser(accountId, rewardAmt, {
            type: 'retweet',
            tweetId,
          });
          log(`➕ Credited ${rewardAmt} to @${username} (accountId: ${accountId})`);
          credited++;
          thisMatch++;
        } catch (e: any) {
          log(`✗ Credit error for @${username}: ${e.message}`);
          errors.push(`credit(${tweetId})→${e.message}`);
        }
      }

      matched += thisMatch;

      const next = res.data.meta?.next_token;
      if (!next) {
        await redisClient.del(`progress:retweet:${tweetId}`);
        log(`✅ Completed all retweeters for tweet ${tweetId}`);
        break;
      } else {
        await redisClient.set(`progress:retweet:${tweetId}`, JSON.stringify({ runId: RUN_ID, nextToken: next }), 'EX', REDIS_TTL_SEC);
        pageToken = next;
        await sleep(CALL_DELAY_MS);
      }
    }

    processed++;
  }

  log('\n✅ Run complete.');
  log(`▶️ Processed: ${processed}`);
  log(`▶️ Skipped:   ${skipped}`);
  log(`▶️ Matched:   ${matched}`);
  log(`▶️ Credited:  ${credited}`);
  log(`▶️ Errors:    ${errors.length}`);
  errors.forEach((e) => log(`  - ${e}`));

  await mongoose.disconnect();
  log('🔌 MongoDB disconnected');
  process.exit(0);
}

main();
