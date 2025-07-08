import axios, { type AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = process.env;

if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
  console.error('❌ Missing Twitter API credentials.');
  process.exit(1);
}

const TWEET_ID = process.argv[2]; // Pass tweet ID as a CLI argument
if (!TWEET_ID) {
  console.error('❌ Please provide a Tweet ID: node fetch-likers.js <tweet_id>');
  process.exit(1);
}

// ─── OAuth1.0a Twitter Client ───────────────────────────────────────────────
function createTwitterClientOAuth1(): AxiosInstance {
  const oauth = new OAuth({
    consumer: {
      key: TWITTER_API_KEY,
      secret: TWITTER_API_SECRET,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    },
  });

  const token = {
    key: TWITTER_ACCESS_TOKEN,
    secret: TWITTER_ACCESS_SECRET,
  };

  const client = axios.create({
    baseURL: 'https://api.twitter.com/2',
  });

  client.interceptors.request.use((config) => {
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

  return client;
}

// ─── Fetch All Likers ───────────────────────────────────────────────────────
async function getAllLikers(tweetId: string): Promise<{ id: string; username: string; name: string }[]> {
  const client = createTwitterClientOAuth1();
  let nextToken: string | undefined;
  const allLikers: { id: string; username: string; name: string }[] = [];

  do {
    const res = await client.get(`/tweets/${tweetId}/liking_users`, {
      params: {
        'user.fields': 'username,name',
        max_results: 100,
        ...(nextToken ? { pagination_token: nextToken } : {}),
      },
    });

    const users = res.data?.data ?? [];
    allLikers.push(...users);
    nextToken = res.data?.meta?.next_token;
  } while (nextToken);

  return allLikers;
}

// ─── Main Logic ─────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log(`📥 Fetching likers for Tweet ID: ${TWEET_ID}`);
    const likers = await getAllLikers(TWEET_ID);
    console.log(`✅ Total Likers: ${likers.length}`);

    const outputDir = path.join(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const filePath = path.join(outputDir, `likers-${TWEET_ID}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ tweetId: TWEET_ID, total: likers.length, likers }, null, 2));
    console.log(`💾 Likers saved to: ${filePath}`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
})();
