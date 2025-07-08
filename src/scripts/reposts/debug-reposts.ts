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

const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN!;
const { MONGO_URI, NIGECOIN_TWITTER_USER_ID: ACCOUNT_ID } = process.env;
if (!MONGO_URI || !ACCOUNT_ID) {
  console.error('❌ Missing MONGO_URI or NIGECOIN_TWITTER_USER_ID');
  process.exit(1);
}

const MAX_PAGE_SIZE = 100;
const RETWEET_THRESHOLD = 400;
const CALL_DELAY_MS = 300;
const MAX_TWEETS_PER_RUN = 20;
const MAX_API_CALLS = 5;
const REDIS_TTL_SEC = 300;
const logPath = getLogPath();

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

function createTwitterClient(): AxiosInstance {
  const c = axios.create({ baseURL: 'https://api.twitter.com/2', headers: { Authorization: `Bearer ${USER_ACCESS_TOKEN}` } });
  c.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (err.response?.status === 429) {
        const reset = Number(err.response.headers['x-rate-limit-reset'] || 0) * 1000;
        const wait = Math.max(reset - Date.now(), 0) + 1000;
        log(`⚠️ Rate limit hit, sleeping ${wait}ms`);
        await sleep(wait);
        return c.request(err.config);
      }
      return Promise.reject(err);
    }
  );
  return c;
}

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

async function getTweetsWithCache(c: AxiosInstance, u: string): Promise<Tweet[]> {
  const key = `cache:retweets:tweets:${u}`;
  try {
    const v = await redisClient.get(key);
    if (v) {
      log('♻️ Using cached tweets');
      return JSON.parse(v);
    }
  } catch (e: any) {
    log(`⚠️ Redis GET failed: ${e.message}`);
  }
  const t = await getAllTweets(c, u);
  try {
    await redisClient.set(key, JSON.stringify(t), 'EX', REDIS_TTL_SEC);
  } catch (e: any) {
    log(`⚠️ Redis SET failed: ${e.message}`);
  }
  return t;
}

async function getRetweeters(client: AxiosInstance, tweetId: string): Promise<TwitterUser[]> {
  const users: TwitterUser[] = [];
  let next: string | undefined;
  do {
    const res: AxiosResponse<RetweetersResponse> = await withRetries(() =>
      client.get(`/tweets/${tweetId}/retweeted_by`, {
        params: { 'user.fields': 'username,name', max_results: MAX_PAGE_SIZE, ...(next ? { pagination_token: next } : {}) },
      })
    );
    users.push(...(res.data.data || []));
    next = res.data.meta?.next_token;
    await sleep(CALL_DELAY_MS);
  } while (next);
  return users;
}

async function main() {
  let processed = 0,
    skipped = 0,
    matched = 0,
    credited = 0,
    calls = 0;
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
  const tweets = await getTweetsWithCache(client, ACCOUNT_ID!);
  log(`✅ ${tweets.length} tweets retrieved`);

  for (const t of tweets) {
    if (calls >= MAX_API_CALLS) {
      log(`⏸ Max API calls reached, stopping`);
      break;
    }
    const { id, public_metrics, created_at } = t;
    const cnt = public_metrics.retweet_count;
    log(`\n📄 Tweet ${id} @ ${created_at} — retweets: ${cnt}`);
    if (cnt === 0 || cnt > RETWEET_THRESHOLD) {
      log('— Skipped (count out of range)');
      skipped++;
      continue;
    }
    processed++;
    calls++;
    let users: TwitterUser[];
    try {
      users = await getRetweeters(client, id);
      log(`   🔄 ${users.length} retweeters`);
    } catch (err: any) {
      log(`✗ Retweeters fetch failed: ${err.message}`);
      errors.push(`getRetweeters(${id})→${err.message}`);
      skipped++;
      continue;
    }
    let thisMatch = 0;
    for (const u of users) {
      if (!registered.has(u.id)) continue;
      const key = `reward:retweet:${u.id}:${id}`;
      if (!(await markRewarded(key))) {
        log(`   🔁 Already rewarded retweet`);
        continue;
      }
      try {
        await creditUser(toAccount.get(u.id)!, rewardAmt, { type: 'retweet', tweetId: id });
        log(`   ➕ Credited ${rewardAmt}`);
        credited++;
        thisMatch++;
      } catch (e: any) {
        log(`   ✗ Credit error: ${e.message}`);
        errors.push(`credit→${e.message}`);
      }
    }
    matched += thisMatch;
    if (thisMatch === 0) log('   🤍 No new retweeters credited');
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
}

main();
