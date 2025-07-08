// ...existing imports
import { ROLES } from '@/constants';
import { creditUser } from '@/services/nige-earn/ledger';
import { markRewarded } from '@/workers/nige-earn/utils/state-store';
import { incrDaily } from '@/workers/nige-earn/utils/limits';
import axios, { type AxiosInstance } from 'axios';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { getLogPath } from '../utils';
import { connectRedis, redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';
import { AccountRoleModel, AuthProviderModel } from '@/db/models';

interface Tweet {
  id: string;
  author_id: string;
  created_at: string;
  text: string;
}
interface SearchResponse {
  data?: Tweet[];
  meta?: { next_token?: string };
}

const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN!;
const { MONGO_URI } = process.env;
if (!MONGO_URI) {
  console.error('❌ Missing MONGO_URI');
  process.exit(1);
}

const MAX_PAGE_SIZE = 100;
const CALL_DELAY_MS = 300;
const MAX_RESULTS_PER_TAG = 2000;
const PER_APP_REQUEST_LIMIT = 440;
const CACHE_TTL = 300;
const REDIS_TTL_SEC = 3600; // progress tracking TTL
const LOOKBACK_HOURS = 60; // ✅ new: 30-hour tweet lookback window
const RUN_ID = `run:${new Date().toISOString().slice(0, 16)}`;
const logPath = getLogPath();

// Logging
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

// ✅ start_time added for hashtag queries
async function fetchHashtagPage(client: AxiosInstance, query: string, next?: string) {
  const start_time = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  return client.get<SearchResponse>(`/tweets/search/recent`, {
    params: {
      query,
      expansions: 'author_id',
      'tweet.fields': 'author_id,created_at,text',
      start_time,
      max_results: MAX_PAGE_SIZE,
      ...(next ? { next_token: next } : {}),
    },
  });
}

// ✅ Enhanced version with progress tracking
async function getHashtagTweetsWithProgress(client: AxiosInstance, tag: string, query: string, requestCounter: { count: number }): Promise<Tweet[]> {
  const results: Tweet[] = [];
  let next: string | undefined;

  const progressKey = `progress:hashtag:${tag}`;
  try {
    const raw = await redisClient.get(progressKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.runId === RUN_ID) {
        next = cached.nextToken;
        log(`↪️ Resuming hashtag "${tag}" from pagination`);
      }
    }
  } catch (err: any) {
    log(`⚠️ Redis GET failed: ${err.message}`);
  }

  while (results.length < MAX_RESULTS_PER_TAG) {
    if (requestCounter.count >= PER_APP_REQUEST_LIMIT) {
      log(`⚠️ Reached app request cap (${PER_APP_REQUEST_LIMIT})`);
      break;
    }

    const resp = await withRetries(() => fetchHashtagPage(client, query, next));
    requestCounter.count++;
    results.push(...(resp.data.data ?? []));
    next = resp.data.meta?.next_token;

    if (!next) {
      await redisClient.del(progressKey);
      break;
    }

    await redisClient.set(progressKey, JSON.stringify({ runId: RUN_ID, nextToken: next }), 'EX', REDIS_TTL_SEC);
    await sleep(CALL_DELAY_MS);
  }

  return results.slice(0, MAX_RESULTS_PER_TAG);
}

async function main() {
  log('Running hashtags script');
  let processed = 0,
    credited = 0,
    skipped = 0;
  const errors: string[] = [];
  const requestCounter = { count: 0 };

  try {
    await connectRedis();
    await mongoose.connect(MONGO_URI!);
    log('✅ MongoDB connected');

    const settings = await fetchSettings();
    const hashtagConfigs = settings.hashtags;
    if (!hashtagConfigs.length) {
      log('⚠️ No hashtags configured — exiting.');
      return;
    }

    const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
    const acctIds = roles.map((r) => r.accountId.toString());
    const providers = await AuthProviderModel.find({
      provider: 'twitter',
      accountId: { $in: acctIds },
    }).lean();
    const registeredIds = new Set(providers.map((p) => p.providerUserId));
    const twitterToAccount = new Map<string, string>(providers.map((p) => [p.providerUserId, p.accountId.toString()]));
    log(`👥 Registered users: ${registeredIds.size}`);

    const client = createTwitterClient();

    for (const { tag, reward } of hashtagConfigs) {
      if (requestCounter.count >= PER_APP_REQUEST_LIMIT) {
        log('⚠️ Stopping loop—request cap reached');
        break;
      }

      const lcTag = tag.toLowerCase();
      const query = `#${lcTag}`;
      log(`\n📥 Searching for "${query}"`);

      let tweets: Tweet[];
      try {
        tweets = await getHashtagTweetsWithProgress(client, lcTag, query, requestCounter);
        log(`✅ ${tweets.length} tweets for "${query}"`);
      } catch (err: any) {
        log(`✗ Search failed for "${query}": ${err.message}`);
        errors.push(`search(${query}) → ${err.message}`);
        continue;
      }

      for (const t of tweets) {
        const { id, author_id, created_at, text } = t;
        processed++;
        log(`\n📄 [${lcTag}] Tweet ${id} by ${author_id}`);
        log(`>>> Tweet text: "${text}"`);

        if (!registeredIds.has(author_id)) {
          log('— Skipped (not registered)');
          skipped++;
          continue;
        }

        const rewardKey = `reward:hashtag:${lcTag}:${author_id}:${id}`;
        const isFirstReward = await markRewarded(rewardKey);
        if (!isFirstReward) {
          log('🔁 Already rewarded this tweet');
          skipped++;
          continue;
        }

        const dayCount = await incrDaily(`daily:hashtag:${lcTag}:${author_id}`);
        if (dayCount > settings.dailyLimit) {
          log(`⚠️ Daily cap reached (${dayCount}/${settings.dailyLimit})`);
          skipped++;
          continue;
        }

        const accountId = twitterToAccount.get(author_id)!;
        try {
          await creditUser(accountId, reward, {
            type: 'hashtag',
            tag: lcTag,
            tweetId: id,
            tweetCreatedAt: created_at,
          });
          log(`➕ Credited ${reward} to ${accountId} (${dayCount}/${settings.dailyLimit})`);
          credited++;
        } catch (err: any) {
          log(`✗ Credit error: ${err.message}`);
          errors.push(`credit(${accountId}) → ${err.message}`);
        }
      }

      await sleep(1_000);
    }

    log('\n✅ Run complete.');
    log(`▶️ Processed: ${processed}`);
    log(`▶️ Credited:  ${credited}`);
    log(`▶️ Skipped:   ${skipped}`);
    log(`▶️ Errors:    ${errors.length}`);
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
