import axios, { type AxiosInstance } from 'axios';
import qs from 'qs';
import dayjs from 'dayjs';
import { TwitterTokenModel } from '@/db/models/twitter-token';
import type { ITwitterToken } from '@/db/models/twitter-token';

// ─── your Twitter app credentials ─────────────────────────────────────────────
const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;

// ─── Helpers ───────────────────────────────────────────────────────────────────

// 1) Retrieve our saved token (or throw if none)
async function loadTokenRecord(): Promise<ITwitterToken & { save(): Promise<void> }> {
  const rec = await TwitterTokenModel.findOne().sort({ expiresAt: -1 });
  if (!rec) throw new Error('No Twitter user token found in DB');
  return rec as any;
}

// 2) Refresh the access token if it’s expired (or about to)
export async function ensureValidToken(): Promise<string> {
  const rec = await loadTokenRecord();
  // add a small clock‐skew buffer
  if (dayjs().isAfter(dayjs(rec.expiresAt).subtract(60, 'second'))) {
    // refresh
    const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
    const body = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: rec.refreshToken,
      client_id: CLIENT_ID,
    });
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const resp = await axios.post(tokenUrl, body, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const data = resp.data as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    rec.accessToken = data.access_token;
    rec.refreshToken = data.refresh_token;
    rec.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await rec.save();
  }
  return rec.accessToken;
}

// 3) Build a fresh Axios instance with our (valid) bearer token
async function createClient(): Promise<AxiosInstance> {
  const token = await ensureValidToken();
  return axios.create({
    baseURL: 'https://api.twitter.com/2',
    timeout: 10_000,
    headers: { Authorization: `Bearer ${token}` },
  });
}

// 4) Shared query params
function makeParams(extra: Record<string, unknown> = {}) {
  return {
    max_results: 100,
    'tweet.fields': 'author_id,created_at,conversation_id,entities,referenced_tweets,in_reply_to_user_id',
    ...extra,
  };
}

// ─── Exported fetchers ─────────────────────────────────────────────────────────

export async function fetchLikes(userId: string, sinceId?: string) {
  const client = await createClient();
  return client.get(`/users/${userId}/liked_tweets`, {
    params: makeParams(sinceId ? { since_id: sinceId } : {}),
  });
}

export async function fetchBookmarks(userId: string, sinceId?: string) {
  const client = await createClient();
  return client.get(`/users/${userId}/bookmarks`, {
    params: makeParams(sinceId ? { since_id: sinceId } : {}),
  });
}

export async function fetchRetweeters(tweetId: string, sinceId?: string) {
  const client = await createClient();
  return client.get(`/tweets/${tweetId}/retweeted_by`, {
    params: { max_results: 100, ...(sinceId ? { since_id: sinceId } : {}) },
  });
}

export async function fetchQuoteTweets(tweetId: string, sinceId?: string) {
  const client = await createClient();
  return client.get(`/tweets/${tweetId}/quote_tweets`, {
    params: makeParams(sinceId ? { since_id: sinceId } : {}),
  });
}

export async function fetchMentions(userId: string, sinceId?: string) {
  const client = await createClient();
  return client.get(`/users/${userId}/mentions`, {
    params: makeParams(sinceId ? { since_id: sinceId } : {}),
  });
}
