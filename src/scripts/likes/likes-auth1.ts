import { ROLES } from '@/constants';
import { creditUser } from '@/services/nige-earn/ledger';
import { markRewarded } from '@/workers/nige-earn/utils/state-store';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { connectRedis, redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';
import { AccountRoleModel, AuthProviderModel } from '@/db/models';
import { getLogPath } from '../utils';

// ─── Interfaces ─────────────────────────────────────────────────────────────
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

// ─── Environment Config ─────────────────────────────────────────────────────
const {
  MONGO_URI,
  NIGECOIN_TWITTER_USER_ID: ACCOUNT_ID,
  TWITTER_BEARER_TOKEN,
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
} = process.env;

if (!MONGO_URI || !ACCOUNT_ID || !TWITTER_BEARER_TOKEN) {
  console.error('❌ Missing required environment variables.');
  process.exit(1);
}

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_PAGE_SIZE = 100;
const LIKE_COUNT_CAP = 2000;
const MAX_TWEETS_PER_RUN = 10;
const CALL_DELAY_MS = 300;
const REDIS_TTL_SEC = 3600;
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
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Twitter Clients ────────────────────────────────────────────────────────
function createTwitterClientOAuth2(): AxiosInstance {
  const c = axios.create({
    baseURL: 'https://api.twitter.com/2',
    headers: {
      Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
    },
  });

  c.interceptors.response.use(
    (r) => r,
    async (err) => {
      if (err.response?.status === 429) {
        const reset = Number(err.response.headers['x-rate-limit-reset'] || 0) * 1000;
        const wait = Math.max(reset - Date.now(), 0) + 1000;
        log(`⚠️ OAuth2 Rate limit hit. Sleeping ${wait / 1000}s`);
        await sleep(wait);
        return c.request(err.config);
      }
      return Promise.reject(err);
    }
  );
  return c;
}

function createTwitterClientOAuth1(): AxiosInstance {
  const oauth = new OAuth({
    consumer: {
      key: TWITTER_API_KEY!,
      secret: TWITTER_API_SECRET!,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    },
  });

  const token = {
    key: TWITTER_ACCESS_TOKEN!,
    secret: TWITTER_ACCESS_SECRET!,
  };

  const c = axios.create({
    baseURL: 'https://api.twitter.com/2',
  });

  c.interceptors.request.use((config) => {
    const url = `${config.baseURL}${config.url}`;
    const request_data = {
      url,
      method: config.method?.toUpperCase() || 'GET',
      data: config.params,
    };
    const oauthHeader = oauth.toHeader(oauth.authorize(request_data, token));
    config.headers = {
      ...config.headers,
      ...oauthHeader,
    };
    return config;
  });

  return c;
}

// ─── Utility ─────────────────────────────────────────────────────────────────
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

// ─── Fetch Tweets (OAuth 2.0) ────────────────────────────────────────────────
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

// ─── Fetch Likers (OAuth 1.0a) ───────────────────────────────────────────────
async function getLikers(client: AxiosInstance, tweetId: string, nextToken?: string): Promise<LikersResponse> {
  return await withRetries(() =>
    client.get(`/tweets/${tweetId}/liking_users`, {
      params: {
        'user.fields': 'username,name',
        max_results: MAX_PAGE_SIZE,
        ...(nextToken ? { pagination_token: nextToken } : {}),
      },
    })
  );
}

// ─── Main Logic ──────────────────────────────────────────────────────────────
async function main() {
  log('Running likes script');
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

  const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).lean();
  const acctIds = roles.map((r) => r.accountId.toString());
  const providers = await AuthProviderModel.find({ provider: 'twitter', accountId: { $in: acctIds } }).lean();
  const registered = new Set(providers.map((p) => p.providerUserId));
  const toAccount = new Map(providers.map((p) => [p.providerUserId, p.accountId.toString()]));

  const tweetClient = createTwitterClientOAuth2();
  const likerClient = createTwitterClientOAuth1();

  log(`📥 Fetching tweets for @${ACCOUNT_ID}`);
  const tweets = await getAllTweets(tweetClient, ACCOUNT_ID!);
  log(`✅ ${tweets.length} tweets retrieved`);

  for (const tweet of tweets) {
    const { id: tweetId, public_metrics, created_at } = tweet;
    const likeCount = public_metrics.like_count;

    log(`\n📄 Tweet ${tweetId} @ ${created_at} — likes: ${likeCount}`);
    if (likeCount === 0 || likeCount > LIKE_COUNT_CAP) {
      log('— Skipped (like count out of range)');
      skipped++;
      continue;
    }

    // Resume Pagination
    let pageToken: string | undefined;
    try {
      const raw = await redisClient.get(`progress:like:${tweetId}`);
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
      let res: AxiosResponse<LikersResponse>;
      try {
        res = await getLikers(likerClient, tweetId, pageToken);
      } catch (err: any) {
        log(`✗ Likers fetch failed: ${err.message}`);
        errors.push(`getLikers(${tweetId}) → ${err.message}`);
        break;
      }

      const users = res.data.data ?? [];
      log(`   👍 Likers fetched: ${users.length}`);

      let thisMatch = 0;
      for (const user of users) {
        const { id: userId, username } = user;
        log(`\n👤 Liker: @${username} (${userId})`);

        if (!registered.has(userId)) {
          log('— Skipped (not registered)');
          continue;
        }

        const rewardKey = `reward:like:${userId}:${tweetId}`;
        const alreadyRewarded = !(await markRewarded(rewardKey));
        if (alreadyRewarded) {
          log('🔁 Already rewarded');
          continue;
        }

        try {
          const accountId = toAccount.get(userId)!;
          await creditUser(accountId, rewardAmt, {
            type: 'like',
            tweetId,
          });
          log(`➕ Credited ${rewardAmt} to @${username} (accountId: ${accountId})`);
          credited++;
          thisMatch++;
        } catch (err: any) {
          log(`✗ Credit failed for @${username}: ${err.message}`);
          errors.push(`credit(${userId}) → ${err.message}`);
        }
      }

      matched += thisMatch;

      const next = res.data.meta?.next_token;
      if (!next) {
        await redisClient.del(`progress:like:${tweetId}`);
        log(`✅ Completed all likers for tweet ${tweetId}`);
        break;
      } else {
        await redisClient.set(`progress:like:${tweetId}`, JSON.stringify({ runId: RUN_ID, nextToken: next }), 'EX', REDIS_TTL_SEC);
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
  if (errors.length) errors.forEach((e) => log(`  - ${e}`));

  await mongoose.disconnect();
  log('🔌 MongoDB disconnected');
  process.exit(0);
}

main();
