import { ROLES } from '@/constants';
import { creditUser } from '@/services/nige-earn/ledger';
import { markRewarded } from '@/workers/nige-earn/utils/state-store';
import { incrDaily } from '@/workers/nige-earn/utils/limits';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { getLogPath } from '../utils';
import { connectRedis, redisClient } from '@/db/redis';
import { AccountRoleModel, AuthProviderModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

interface Tweet {
  id: string;
  conversation_id: string;
  author_id: string;
  created_at: string;
}
interface SearchResponse {
  data?: Tweet[];
  meta?: { next_token?: string };
}

// ─── Config ─────────────────────────────────────────────────────────────────
const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN!;
const { MONGO_URI, NIGECOIN_TWITTER_USER_ID: ACCOUNT_ID } = process.env;
if (!MONGO_URI || !ACCOUNT_ID) {
  console.error('❌ Missing MONGO_URI or NIGECOIN_TWITTER_USER_ID');
  process.exit(1);
}

const MAX_PAGE_SIZE = 100;
const MAX_TWEETS_PER_RUN = 10;
const CALL_DELAY_MS = 300;
const MAX_RESULTS = 2000;
const PER_APP_REQUEST_LIMIT = 440;
const REDIS_TTL_SEC = 3600;
const LOOKBACK_HOURS = 60; // ✅ new constant
const RUN_ID = `run:${new Date().toISOString().slice(0, 16)}`;
const logPath = getLogPath();

// ─── Logging Setup ──────────────────────────────────────────────────────────
const logDir = path.join(__dirname, logPath);
fs.mkdirSync(logDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logFilePath = path.join(logDir, `${ts}.log`);
fs.writeFileSync(logFilePath, '', 'utf-8');
function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFilePath, msg + '\n', 'utf-8');
}
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Twitter Client ─────────────────────────────────────────────────────────
function createTwitterClient(): AxiosInstance {
  const client = axios.create({
    baseURL: 'https://api.twitter.com/2',
    headers: { Authorization: `Bearer ${USER_ACCESS_TOKEN}` },
  });
  client.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (err.response?.status === 429) {
        const resetMs = Number(err.response.headers['x-rate-limit-reset'] || 0) * 1000;
        const wait = Math.max(resetMs - Date.now(), 0) + 1_000;
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
      log(`⚠️ Retry #${attempt}: ${err.message}`);
      await sleep(500 * attempt);
      return withRetries(fn, attempt + 1);
    }
    throw err;
  }
}

// ─── Fetch Replies with Progress ────────────────────────────────────────────
async function fetchRepliesPage(client: AxiosInstance, tweetId: string, next?: string): Promise<AxiosResponse<SearchResponse>> {
  const query = `conversation_id:${tweetId}`;
  const start_time = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString(); // ✅ apply lookback

  return client.get('/tweets/search/recent', {
    params: {
      query,
      'tweet.fields': 'author_id,conversation_id,created_at',
      start_time,
      max_results: MAX_PAGE_SIZE,
      ...(next ? { next_token: next } : {}),
    },
  });
}

async function getRepliesWithProgress(client: AxiosInstance, tweetId: string, counter: { count: number }): Promise<Tweet[]> {
  const all: Tweet[] = [];
  let next: string | undefined;

  const progressKey = `progress:reply:${tweetId}`;
  try {
    const raw = await redisClient.get(progressKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.runId === RUN_ID) {
        next = cached.nextToken;
        log(`↪️ Resuming pagination for replies of ${tweetId}`);
      }
    }
  } catch (err: any) {
    log(`⚠️ Redis progress GET failed: ${err.message}`);
  }

  while (all.length < MAX_RESULTS) {
    if (counter.count >= PER_APP_REQUEST_LIMIT) {
      log(`⚠️ Reached request cap (${PER_APP_REQUEST_LIMIT})`);
      break;
    }

    const resp = await withRetries(() => fetchRepliesPage(client, tweetId, next));
    counter.count++;

    const replies = (resp.data.data ?? []).filter((t) => t.id !== tweetId && t.conversation_id === tweetId);
    all.push(...replies);

    next = resp.data.meta?.next_token;
    if (!next) {
      await redisClient.del(progressKey);
      break;
    }

    await redisClient.set(progressKey, JSON.stringify({ runId: RUN_ID, nextToken: next }), 'EX', REDIS_TTL_SEC);
    await sleep(CALL_DELAY_MS);
  }

  return all.slice(0, MAX_RESULTS);
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
async function main() {
  log('Running replies script');
  let processed = 0,
    credited = 0,
    skipped = 0;
  const errors: string[] = [];
  const counter = { count: 0 };

  try {
    await connectRedis();
    await mongoose.connect(MONGO_URI!);
    log('✅ MongoDB connected');

    const settings = await fetchSettings();
    const replyReward = settings.replyReward;
    if (!replyReward) {
      log('⚠️ No replyReward configured — exiting.');
      return;
    }

    const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
    const acctIds = roles.map((r) => r.accountId.toString());
    const providers = await AuthProviderModel.find({ provider: 'twitter', accountId: { $in: acctIds } }).lean();
    const registered = new Set(providers.map((p) => p.providerUserId));
    const toAccount = new Map(providers.map((p) => [p.providerUserId, p.accountId.toString()]));
    log(`👥 Registered users: ${registered.size}`);

    const client = createTwitterClient();
    const origResp = await client.get<{ data: Tweet[] }>(`/users/${ACCOUNT_ID}/tweets`, {
      params: {
        'tweet.fields': 'conversation_id,author_id,created_at',
        exclude: 'retweets,replies',
        max_results: MAX_TWEETS_PER_RUN,
      },
    });
    const originals = origResp.data.data || [];

    for (const orig of originals) {
      log(`\n📥 Fetching replies for tweet ${orig.id}`);
      const replies = await getRepliesWithProgress(client, orig.id, counter);
      log(`✅ Found ${replies.length} replies`);

      for (const r of replies) {
        processed++;
        const { id: replyId, author_id, created_at: replyCreatedAt } = r;

        if (!registered.has(author_id)) {
          log(`— Skipped unregistered user ${author_id}`);
          skipped++;
          continue;
        }

        const rewardKey = `reward:reply:${author_id}:${replyId}`;
        const isFirstReward = await markRewarded(rewardKey);
        if (!isFirstReward) {
          log(`🔁 Already rewarded reply ${replyId}`);
          skipped++;
          continue;
        }

        const perTweetCount = await incrDaily(`per_tweet:reply:${orig.id}:${author_id}`);
        if (perTweetCount > 2) {
          log(`⚠️ Per-tweet cap reached (2) for ${author_id} on ${orig.id}`);
          skipped++;
          continue;
        }

        const accountId = toAccount.get(author_id)!;
        try {
          await creditUser(accountId, replyReward, {
            type: 'reply',
            tweetId: orig.id,
            replyId,
            replyCreatedAt,
          });
          log(`➕ Credited ${replyReward} to ${accountId} (${perTweetCount}/2)`);
          credited++;
        } catch (err: any) {
          log(`✗ Credit error: ${err.message}`);
          errors.push(`credit(${accountId}) → ${err.message}`);
        }
      }
    }

    log('\n✅ Run complete.');
    log(`▶️ Processed: ${processed}`);
    log(`▶️ Credited:  ${credited}`);
    log(`▶️ Skipped:   ${skipped}`);
    if (errors.length) {
      log('🚨 Errors:');
      errors.forEach((e) => log(`  - ${e}`));
    }
  } catch (err: any) {
    log(`❌ Fatal error: ${err.message}`);
  } finally {
    await mongoose.disconnect();
    log('🔌 MongoDB disconnected');
    process.exit(0);
  }
}

main();
