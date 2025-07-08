import axios from 'axios';
import fs from 'fs';
import path from 'path';

// ─── Config ────────────────────────────────────────────────────────────────
const BEARER_TOKEN = process.env.USER_ACCESS_TOKEN;
if (!BEARER_TOKEN) {
  console.error('❌ USER_ACCESS_TOKEN env variable not set');
  process.exit(1);
}

const TWEET_ID = process.argv[2];
if (!TWEET_ID) {
  console.error('❌ Please provide a Tweet ID: node fetch-retweeters.js <tweet_id>');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, 'output');
const FILE_PATH = path.join(OUTPUT_DIR, `retweeters-${TWEET_ID}.json`);
const API_BASE = 'https://api.twitter.com/2';
const PAGE_SIZE = 100;

// ─── Axios Client ───────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: API_BASE,
  headers: {
    Authorization: `Bearer ${BEARER_TOKEN}`,
  },
});

// ─── Utils ──────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Fetch All Retweeters ──────────────────────────────────────────────────
async function getAllRetweeters(tweetId: string) {
  let nextToken: string | undefined;
  const all: { id: string; username: string; name: string }[] = [];

  do {
    const res = await client.get(`/tweets/${tweetId}/retweeted_by`, {
      params: {
        'user.fields': 'username,name',
        max_results: PAGE_SIZE,
        ...(nextToken ? { pagination_token: nextToken } : {}),
      },
    });

    const users = res.data?.data ?? [];
    all.push(...users);

    nextToken = res.data.meta?.next_token;

    if (nextToken) {
      await sleep(300); // Rate limit buffer
    }
  } while (nextToken);

  return all;
}

// ─── Main ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log(`📥 Fetching retweeters for Tweet ID: ${TWEET_ID}`);
    const retweeters = await getAllRetweeters(TWEET_ID);
    console.log(`✅ Total Retweeters: ${retweeters.length}`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      FILE_PATH,
      JSON.stringify(
        {
          tweetId: TWEET_ID,
          total: retweeters.length,
          retweeters,
        },
        null,
        2
      )
    );

    console.log(`💾 Retweeter data saved to ${FILE_PATH}`);
  } catch (err: any) {
    console.error(`❌ Error fetching retweeters: ${err.message}`);
    process.exit(1);
  }
})();
