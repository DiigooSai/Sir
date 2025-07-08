import { z } from 'zod';
import type { Context } from 'hono';
import { runInTransaction } from '@/utils/transaction-helper';
import { ApiResponse } from '@/utils/ApiResponse';
import { addMention, fetchSettings, removeMention, updateMention } from '@/services/nige-earn/reward-settings';

/* ───── payload schemas ───── */
export const mentionZ = z.object({
  tag: z.string().trim().min(1),
  reward: z.number().int().positive(),
});
export const patchMentionZ = z.object({
  reward: z.number().int().positive(),
});

/* ───── handlers ───── */
export async function addMentionHandler(c: Context) {
  const { tag, reward } = c.req.valid('json') as z.infer<typeof mentionZ>;
  const updated = await runInTransaction((s) => addMention(tag, reward, s));
  return c.json(new ApiResponse(200, updated, 'mention added'));
}

export async function removeMentionHandler(c: Context) {
  const tag = c.req.param('tag');
  const updated = await runInTransaction((session) => removeMention(tag, session));
  return c.json(new ApiResponse(200, updated, 'Mention removed'));
}

export async function updateMentionHandler(c: Context) {
  const tag = c.req.param('tag');
  const { reward } = c.req.valid('json') as z.infer<typeof patchMentionZ>;
  const updated = await runInTransaction((session) => updateMention(tag, reward, session));
  return c.json(new ApiResponse(200, updated, 'Mention updated'));
}

export async function getMentionHandler(c: Context) {
  const tag = c.req.param('tag');
  const doc = await fetchSettings();
  const mention = doc.mentions.find((m) => m.tag === tag);
  if (!mention) return c.json(new ApiResponse(404, null, 'mention not found'), 404);
  return c.json(new ApiResponse(200, mention));
}
