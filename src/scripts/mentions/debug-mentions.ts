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
  meta?: { next_token?: string; result_count: number };
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
const REDIS_TTL_SEC = 3600;
const LOOKBACK_HOURS = 60; // ✅ Limit search to past 30 hours
const RUN_ID = `run:${new Date().toISOString().slice(0, 16)}`;

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
      log(`⚠️ Retry #${attempt}: ${err.message}`);
      console.log(err);
      await sleep(500 * attempt);
      return withRetries(fn, attempt + 1);
    }
    throw err;
  }
}

async function fetchPage(client: AxiosInstance, query: string, next?: string) {
  const start_time = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString(); // ✅ start_time added

  return client.get<SearchResponse>(`/tweets/search/recent`, {
    params: {
      query,
      expansions: 'author_id',
      'tweet.fields': 'author_id,created_at,text',
      'user.fields': 'username,name',
      start_time,
      max_results: MAX_PAGE_SIZE,
      ...(next ? { next_token: next } : {}),
    },
  });
}

// ✅ Mentions fetcher with Redis-based pagination progress
async function getMentionsWithProgress(client: AxiosInstance, tag: string, counter: { count: number }): Promise<Tweet[]> {
  const all: Tweet[] = [];
  let next: string | undefined;

  const query = `@${tag.toLowerCase()} -is:retweet`;
  const progressKey = `progress:mention:${tag.toLowerCase()}`;

  try {
    const raw = await redisClient.get(progressKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.runId === RUN_ID) {
        next = cached.nextToken;
        log(`↪️ Resuming "${tag}" mentions from pagination`);
      }
    }
  } catch (err: any) {
    log(`⚠️ Redis progress GET failed: ${err.message}`);
  }

  while (all.length < MAX_RESULTS_PER_TAG) {
    if (counter.count >= PER_APP_REQUEST_LIMIT) {
      log(`⚠️ Reached app request cap (${PER_APP_REQUEST_LIMIT})`);
      break;
    }

    const resp = await withRetries(() => fetchPage(client, query, next));
    counter.count++;
    all.push(...(resp.data.data ?? []));
    next = resp.data.meta?.next_token;

    if (!next) {
      await redisClient.del(progressKey);
      break;
    }

    await redisClient.set(progressKey, JSON.stringify({ runId: RUN_ID, nextToken: next }), 'EX', REDIS_TTL_SEC);
    await sleep(CALL_DELAY_MS);
  }

  return all.slice(0, MAX_RESULTS_PER_TAG);
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
async function main() {
  log('Running mentions script');
  let processed = 0,
    credited = 0,
    skipped = 0;
  const errors: string[] = [];
  const requestCounter = { count: 0 };

  await connectRedis();
  await mongoose.connect(MONGO_URI!);
  log('✅ MongoDB connected');

  const settings = await fetchSettings();
  const mentionConfigs = settings.mentions;
  if (!mentionConfigs.length) {
    log('⚠️ No mention tags configured — exiting.');
    return;
  }

  const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
  const acctIds = roles.map((r) => r.accountId.toString());
  const providers = await AuthProviderModel.find({ provider: 'twitter', accountId: { $in: acctIds } }).lean();
  const registered = new Set(providers.map((p) => p.providerUserId));
  const toAccount = new Map(providers.map((p) => [p.providerUserId, p.accountId.toString()]));
  log(`👥 Registered users: ${registered.size}`);

  const client = createTwitterClient();

  for (const { tag, reward } of mentionConfigs) {
    if (requestCounter.count >= PER_APP_REQUEST_LIMIT) {
      log('⚠️ Stopping tag loop—request cap reached');
      break;
    }

    const lc = tag.toLowerCase();
    log(`\n📥 Searching mentions for "@${lc}"`);

    let tweets: Tweet[];
    try {
      tweets = await getMentionsWithProgress(client, lc, requestCounter);
      log(`✅ ${tweets.length} mentions for "@${lc}"`);
    } catch (err: any) {
      log(`✗ Search failed for "@${lc}": ${err.message}`);
      errors.push(`search(${lc}) → ${err.message}`);
      continue;
    }

    for (const t of tweets) {
      const { id, author_id, created_at, text } = t;
      processed++;
      log(`\n📄 Mention ${id} @ ${created_at} by ${author_id}`);
      log(`>>> Tweet text: "${text}"`);

      const words = text.trim().split(/\s+/);
      const strippedText = words.slice(1).join(' ').toLowerCase();

      if (!strippedText.includes(`@${lc}`)) {
        log('— Skipped (no explicit @mention beyond first word)');
        skipped++;
        continue;
      }

      if (!registered.has(author_id)) {
        log('— Skipped (not registered)');
        skipped++;
        continue;
      }

      const rewardKey = `reward:mention:${lc}:${author_id}:${id}`;
      const isFirstReward = await markRewarded(rewardKey);
      if (!isFirstReward) {
        log('🔁 Already rewarded this tweet');
        skipped++;
        continue;
      }

      const dailyCount = await incrDaily(`daily:mention:${lc}:${author_id}`);
      if (dailyCount > settings.dailyLimit) {
        log(`⚠️ Daily cap reached (${dailyCount}/${settings.dailyLimit})`);
        skipped++;
        continue;
      }

      try {
        const accountId = toAccount.get(author_id)!;
        await creditUser(accountId, reward, {
          type: 'mention',
          tag: lc,
          tweetId: id,
          tweetCreatedAt: created_at,
        });
        log(`➕ Credited ${reward} to ${accountId} (${dailyCount}/${settings.dailyLimit})`);
        credited++;
      } catch (err: any) {
        log(`✗ Credit error: ${err.message}`);
        errors.push(`credit(${author_id}) → ${err.message}`);
      }
    }

    await sleep(1000);
  }

  log('\n✅ Run complete.');
  log(`▶️ Processed: ${processed}`);
  log(`▶️ Credited:  ${credited}`);
  log(`▶️ Skipped:   ${skipped}`);
  log(`▶️ Errors:    ${errors.length}`);
  if (errors.length) errors.forEach((e) => log(`  - ${e}`));

  await mongoose.disconnect();
  log('🔌 MongoDB disconnected');
  process.exit(0);
}

main();
