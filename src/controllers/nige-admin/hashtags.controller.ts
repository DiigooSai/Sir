import { z } from 'zod';
import type { Context } from 'hono';
import { runInTransaction } from '@/utils/transaction-helper';
import { ApiResponse } from '@/utils/ApiResponse';
import { addHashtag, fetchSettings, removeHashtag, updateHashtag } from '@/services/nige-earn/reward-settings';

/* payload validator: same as mention */
export const hashtagZ = z.object({
  tag: z.string().trim().min(1),
  reward: z.number().int().positive(),
});

export const patchHashtagZ = z.object({
  reward: z.number().int().positive(),
});
/* handlers */
export async function addHashtagHandler(c: Context) {
  const { tag, reward } = c.req.valid('json') as z.infer<typeof hashtagZ>;
  const updated = await runInTransaction((s) => addHashtag(tag, reward, s));
  return c.json(new ApiResponse(200, updated, 'hashtag added'));
}

export async function removeHashtagHandler(c: Context) {
  const tag = c.req.param('tag');
  const updated = await runInTransaction((s) => removeHashtag(tag, s));
  return c.json(new ApiResponse(200, updated, 'hashtag removed'));
}

export async function updateHashtagHandler(c: Context) {
  const { reward } = c.req.valid('json') as z.infer<typeof hashtagZ>;
  const tag = c.req.param('tag');
  const updated = await runInTransaction((s) => updateHashtag(tag, reward, s));
  return c.json(new ApiResponse(200, updated, 'hashtag updated'));
}
export async function getHashtagHandler(c: Context) {
  const tag = c.req.param('tag');
  const doc = await fetchSettings();
  const hashtag = doc.hashtags.find((h) => h.tag === tag);
  if (!hashtag) return c.json(new ApiResponse(404, null, 'hashtag not found'), 404);
  return c.json(new ApiResponse(200, hashtag));
}
