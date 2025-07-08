import { ROLES } from '@/constants';
import { creditUser } from '@/services/nige-earn/ledger';
import { markRewarded } from '@/workers/nige-earn/utils/state-store';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { getLogPath } from '../utils';
import { connectRedis, redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';
import { AccountRoleModel, AuthProviderModel } from '@/db/models';

interface Tweet {
  id: string;
  public_metrics: { like_count: number };
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
interface LikersResponse {
  data?: TwitterUser[];
  meta?: { next_token?: string };
}

const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN!;
const { MONGO_URI, NIGECOIN_TWITTER_USER_ID: ACCOUNT_ID } = process.env;
if (!MONGO_URI || !ACCOUNT_ID) {
  console.error('❌ Missing MONGO_URI or NIGECOIN_TWITTER_USER_ID');
  process.exit(1);
}

const MAX_PAGE_SIZE = 100;
const LIKE_COUNT_THRESHOLD = 500;
const CALL_DELAY_MS = 300;
const MAX_TWEETS_PER_RUN = 30;
const REDIS_TTL_SEC = 300; // seconds cache
const logPath = getLogPath();

// ─── logging setup ───────────────────────────────────────────────────────────
const logDir = path.join(__dirname, logPath);
fs.mkdirSync(logDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `${ts}.log`);
fs.writeFileSync(logFile, '', 'utf-8');
function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n', 'utf-8');
}

// ─── utilities ────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function createTwitterClient(): AxiosInstance {
  const client = axios.create({
    baseURL: 'https://api.twitter.com/2',
    headers: { Authorization: `Bearer ${USER_ACCESS_TOKEN}` },
  });
  client.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (err.response?.status === 429) {
        const reset = Number(err.response.headers['x-rate-limit-reset'] || 0) * 1000;
        const wait = Math.max(reset - Date.now(), 0) + 1000;
        log(`⚠️ Rate limit hit, sleeping ${wait}ms`);
        await sleep(wait);
        return client.request(err.config);
      }
      return Promise.reject(err);
    }
  );
  return client;
}
async function withRetries<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (attempt < 3) {
      console.log('err', err);
      log(`⚠️ Retry #${attempt}: ${err.message}`);
      await sleep(500 * attempt);
      return withRetries(fn, attempt + 1);
    }
    throw err;
  }
}

// ─── tweet fetching + caching ─────────────────────────────────────────────────
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
    all.push(...(res.data.data ?? []));
    next = res.data.meta?.next_token;
    await sleep(CALL_DELAY_MS);
  } while (next && all.length < MAX_TWEETS_PER_RUN);
  return all.slice(0, MAX_TWEETS_PER_RUN);
}

async function getTweetsWithCache(client: AxiosInstance, userId: string): Promise<Tweet[]> {
  const key = `cache:likes:tweets:${userId}`;
  try {
    const c = await redisClient.get(key);
    if (c) {
      log(`♻️ Using cached tweets`);
      return JSON.parse(c);
    }
  } catch (err: any) {
    log(`⚠️ Redis GET failed: ${err.message}`);
  }
  const tweets = await getAllTweets(client, userId);
  try {
    await redisClient.set(key, JSON.stringify(tweets), 'EX', REDIS_TTL_SEC);
  } catch (err: any) {
    log(`⚠️ Redis SET failed: ${err.message}`);
  }
  return tweets;
}

// ─── likers pagination ────────────────────────────────────────────────────────
async function getLikers(client: AxiosInstance, tweetId: string): Promise<TwitterUser[]> {
  const users: TwitterUser[] = [];
  let next: string | undefined;
  do {
    const res: AxiosResponse<LikersResponse> = await withRetries(() =>
      client.get(`/tweets/${tweetId}/liking_users`, {
        params: { 'user.fields': 'username,name', max_results: MAX_PAGE_SIZE, ...(next ? { pagination_token: next } : {}) },
      })
    );
    users.push(...(res.data.data ?? []));
    next = res.data.meta?.next_token;
    await sleep(CALL_DELAY_MS);
  } while (next);
  return users;
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  let processed = 0,
    skipped = 0,
    matched = 0,
    credited = 0;
  const errors: string[] = [];

  await connectRedis();
  await mongoose.connect(MONGO_URI!);
  log('✅ MongoDB connected');

  const settings = await fetchSettings();
  const rewardAmt = settings.likeReward;
  if (!rewardAmt) {
    log('⚠️ likeReward not set, exiting.');
    return;
  }

  // build user map
  const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
  const acctIds = roles.map((r) => r.accountId.toString());
  const providers = await AuthProviderModel.find({ provider: 'twitter', accountId: { $in: acctIds } }).lean();
  const registered = new Set(providers.map((p) => p.providerUserId));
  const toAccount = new Map(providers.map((p) => [p.providerUserId, p.accountId.toString()]));

  log(`👥 Registered users: ${registered.size}`);

  const client = createTwitterClient();
  log(`📥 Fetching recent tweets for @${ACCOUNT_ID}`);
  const tweets = await getTweetsWithCache(client, ACCOUNT_ID!);
  log(`✅ ${tweets.length} tweets fetched`);

  for (const t of tweets) {
    const { id, public_metrics, created_at } = t;
    const count = public_metrics.like_count;
    log(`\n📄 Tweet ${id} @ ${created_at} — likes: ${count}`);

    if (count === 0 || count > LIKE_COUNT_THRESHOLD) {
      log('— Skipped (like count out of range)');
      skipped++;
      continue;
    }

    processed++;
    let likers: TwitterUser[];
    try {
      likers = await getLikers(client, id);
      log(`   👍 ${likers.length} likers`);
    } catch (err: any) {
      log(`✗ Likers fetch failed: ${err.message}`);
      errors.push(`getLikers(${id}) → ${err.message}`);
      skipped++;
      continue;
    }

    let thisMatch = 0;
    for (const u of likers) {
      if (!registered.has(u.id)) continue;
      const key = `reward:like:${u.id}:${id}`;
      if (!(await markRewarded(key))) {
        log(`   🔁 Already rewarded like for user ${u.id}`);
        continue;
      }
      try {
        await creditUser(toAccount.get(u.id)!, rewardAmt, { type: 'like', tweetId: id });
        log(`   ➕ Credited ${rewardAmt} to account ${toAccount.get(u.id)}`);
        credited++;
        thisMatch++;
      } catch (e: any) {
        log(`   ✗ Credit failed: ${e.message}`);
        errors.push(`credit(${u.id}) → ${e.message}`);
      }
    }
    matched += thisMatch;
    if (thisMatch === 0) log('   🤍 No new likers credited');
  }

  log('\n✅ Run complete.');
  log(`▶️ Processed: ${processed}`);
  log(`▶️ Skipped:   ${skipped}`);
  log(`▶️ Matched:   ${matched}`);
  log(`▶️ Credited:  ${credited}`);
  log(`▶️ Errors:    ${errors.length}`);
  if (errors.length) errors.forEach((e) => log(`  - ${e}`));

  await mongoose.disconnect();
  log('🔌 MongoDB disconnected');
}

main();
