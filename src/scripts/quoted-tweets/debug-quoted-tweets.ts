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
  public_metrics: { quote_count: number };
  created_at: string;
}
interface SearchTweet {
  id: string;
  author_id: string;
}
interface SearchResponse {
  data?: SearchTweet[];
  includes?: { users: { id: string; username: string; name: string }[] };
  meta?: { next_token?: string };
}

// ─── Environment and Config ──────────────────────────────────────────────────
const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN!;
const { MONGO_URI, NIGECOIN_TWITTER_USER_ID: ACCOUNT_ID } = process.env;
if (!MONGO_URI || !ACCOUNT_ID) {
  console.error('❌ Missing MONGO_URI or NIGECOIN_TWITTER_USER_ID');
  process.exit(1);
}

const MAX_TWEETS_PER_RUN = 10; // max tweets per run
const MAX_PAGES = 20; // max pages to fetch 3 -> 300 quote tweets
const QUOTE_THRESHOLD = 2000; // max quote count per tweet
const MAX_PAGE_SIZE = 100;
const CALL_DELAY_MS = 300;
const REDIS_TTL_SEC = 3600; // 1 hour
const LOOKBACK_HOURS = 60; // ← added: look back window for quote tweets
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

// ─── Twitter Client ─────────────────────────────────────────────────────────
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

// ─── Tweet Fetching ─────────────────────────────────────────────────────────
async function getAllTweets(client: AxiosInstance, u: string): Promise<Tweet[]> {
  const all: Tweet[] = [];
  let next: string | undefined;
  do {
    const res = await withRetries(() =>
      client.get<{ data: Tweet[]; meta: { next_token?: string } }>(`/users/${u}/tweets`, {
        params: {
          max_results: MAX_PAGE_SIZE,
          'tweet.fields': 'public_metrics,created_at',
          exclude: 'retweets,replies',
          ...(next ? { pagination_token: next } : {}),
        },
      })
    );
    all.push(...(res.data.data || []));
    next = res.data.meta.next_token;
    await sleep(CALL_DELAY_MS);
  } while (next && all.length < MAX_TWEETS_PER_RUN);
  return all.slice(0, MAX_TWEETS_PER_RUN);
}

async function getTweetsWithCache(c: AxiosInstance, u: string): Promise<Tweet[]> {
  const key = `cache:quotes:tweets:${u}`;
  try {
    const v = await redisClient.get(key);
    if (v) {
      log('♻️ Cache hit');
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

// ─── Quote Fetching with Progress ───────────────────────────────────────────
async function getQuoteUsers(
  client: AxiosInstance,
  tweetId: string,
  username: string
): Promise<{ id: string; username: string; quoteTweetId: string }[]> {
  const results: { id: string; username: string; quoteTweetId: string }[] = [];
  let next: string | undefined;

  // Compute start_time for lookback
  const startTime = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // Attempt to resume progress
  try {
    const raw = await redisClient.get(`progress:quote:${tweetId}`);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.runId === RUN_ID) {
        next = cached.nextToken;
        log(`↪️ Resuming quote search for tweet ${tweetId}`);
      } else {
        log(`🆕 Fresh run for tweet ${tweetId}`);
      }
    }
  } catch (e: any) {
    log(`⚠️ Redis progress GET failed: ${e.message}`);
  }

  let pages = 0;
  do {
    const res: AxiosResponse<SearchResponse> = await withRetries(() =>
      client.get('/tweets/search/recent', {
        params: {
          query: `url:twitter.com/${username}/status/${tweetId} is:quote`,
          expansions: 'author_id',
          'tweet.fields': 'author_id',
          'user.fields': 'username,name',
          start_time: startTime, // ← added param
          max_results: MAX_PAGE_SIZE,
          ...(next ? { next_token: next } : {}),
        },
      })
    );

    const userMap = new Map<string, string>();
    res.data.includes?.users?.forEach((u) => userMap.set(u.id, u.username));
    (res.data.data || []).forEach((t) => {
      const usr = userMap.get(t.author_id) || '';
      results.push({ id: t.author_id, username: usr, quoteTweetId: t.id });
    });

    next = res.data.meta?.next_token;

    if (!next) {
      await redisClient.del(`progress:quote:${tweetId}`);
      break;
    }

    await redisClient.set(`progress:quote:${tweetId}`, JSON.stringify({ runId: RUN_ID, nextToken: next }), 'EX', REDIS_TTL_SEC);

    pages++;
    await sleep(CALL_DELAY_MS);
  } while (next && pages < MAX_PAGES);

  return results;
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
async function main() {
  log('Running quoted-tweets script');
  let processed = 0,
    skipped = 0,
    matched = 0,
    credited = 0;
  const errors: string[] = [];

  await connectRedis();
  await mongoose.connect(MONGO_URI!);
  log('✅ MongoDB connected');

  const settings = await fetchSettings();
  const rewardAmt = settings.quoteTweetReward;
  if (!rewardAmt) {
    log('⚠️ quoteTweetReward not set, exiting.');
    return;
  }

  const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
  const acctIds = roles.map((r) => r.accountId.toString());
  const providers = await AuthProviderModel.find({ provider: 'twitter', accountId: { $in: acctIds } }).lean();
  const registered = new Set(providers.map((p) => p.providerUserId));
  const toAccount = new Map(providers.map((p) => [p.providerUserId, p.accountId.toString()]));

  const client = createTwitterClient();
  const userRes = await client.get<{ data: { username: string } }>(`/users/${ACCOUNT_ID}`);
  const username = userRes.data.data.username;

  log(`📥 Fetching tweets for @${username}`);
  const tweets = await getTweetsWithCache(client, ACCOUNT_ID!);
  log(`✅ ${tweets.length} tweets retrieved`);

  for (const t of tweets) {
    const { id: originalTweetId, public_metrics, created_at } = t;
    const cnt = public_metrics.quote_count;
    log(`\n📄 Tweet ${originalTweetId} @ ${created_at} — quotes: ${cnt}`);
    if (cnt === 0 || cnt > QUOTE_THRESHOLD) {
      log('— Skipped (out of range)');
      skipped++;
      continue;
    }
    processed++;

    let quoters: { id: string; username: string; quoteTweetId: string }[];
    try {
      quoters = await getQuoteUsers(client, originalTweetId, username);
      log(`   💬 ${quoters.length} quoters`);
    } catch (err: any) {
      log(`✗ Quote fetch failed: ${err.message}`);
      errors.push(`getQuoteUsers→${err.message}`);
      skipped++;
      continue;
    }

    let thisMatch = 0;
    for (const u of quoters) {
      if (!registered.has(u.id)) continue;
      const key = `reward:quote:${u.id}:${originalTweetId}`;
      if (!(await markRewarded(key))) {
        log(`   🔁 Already rewarded quote`);
        continue;
      }
      try {
        await creditUser(toAccount.get(u.id)!, rewardAmt, {
          type: 'quote',
          originalTweetId,
          quoteTweetId: u.quoteTweetId,
        });
        log(`   ➕ Credited ${rewardAmt} for original ${originalTweetId} via quote ${u.quoteTweetId}`);
        credited++;
        thisMatch++;
      } catch (e: any) {
        log(`   ✗ Credit error: ${e.message}`);
        errors.push(`credit→${e.message}`);
      }
    }

    matched += thisMatch;
    if (thisMatch === 0) log('   🤍 No new quoters credited');
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
