import { RewardSettingsModel, type IRewardSettings, type RewardSettingsDocument } from '@/db/models/reward-settings';
import type { ClientSession } from 'mongoose';

/**
 * Fetch the singleton settings document (read-only).
 */
export async function fetchSettings(): Promise<RewardSettingsDocument> {
  const doc = await RewardSettingsModel.findOne();
  if (doc) return doc;
  return RewardSettingsModel.create({});
}

/**
 * Patch the singleton settings document inside the passed session,
 * then return the updated plain object.
 */
export async function patchSettings(input: Partial<IRewardSettings>, session: ClientSession): Promise<IRewardSettings> {
  // 1) Grab or create the singleton within this session
  let settings = await RewardSettingsModel.findOne().session(session);
  if (!settings) {
    // create with defaults
    [settings] = await RewardSettingsModel.create([{}], { session });
  }

  // 2) Apply each field from the DTO
  Object.entries(input).forEach(([k, v]) => {
    // @ts-ignore
    settings[k] = v;
  });

  // 3) Save under the same transaction session
  await settings.save({ session });

  // 4) Return a plain JS object
  return settings.toObject();
}

async function ensureSettings(session: ClientSession) {
  let doc = await RewardSettingsModel.findOne().session(session);
  if (!doc) {
    [doc] = await RewardSettingsModel.create([{}], { session });
  }
  return doc;
}

/** create – no duplicate tags */
export async function addMention(tag: string, reward: number, session: ClientSession) {
  const s = await ensureSettings(session);
  if (s.mentions.some((m) => m.tag === tag)) throw new Error(`Mention "${tag}" already exists`);
  s.mentions.push({ tag, reward });
  await s.save({ session });
  return s.toObject();
}

/** delete (silently ignored if the tag wasn’t there) */
export async function removeMention(tag: string, session: ClientSession) {
  const s = await ensureSettings(session);
  s.mentions = s.mentions.filter((m) => m.tag !== tag);
  await s.save({ session });
  return s.toObject();
}

/** update reward of an existing tag */
export async function updateMention(tag: string, reward: number, session: ClientSession) {
  const s = await ensureSettings(session);
  const m = s.mentions.find((m) => m.tag === tag);
  if (!m) throw new Error(`Mention "${tag}" not found`);
  m.reward = reward;
  await s.save({ session });
  return s.toObject();
}

export async function addHashtag(tag: string, reward: number, session: ClientSession) {
  const s = await ensureSettings(session);
  if (s.hashtags.some((h) => h.tag === tag)) throw new Error(`Hashtag "${tag}" already exists`);
  s.hashtags.push({ tag, reward });
  await s.save({ session });
  return s.toObject();
}

/** delete (silently ignored if the tag wasn’t there) */
export async function removeHashtag(tag: string, session: ClientSession) {
  const s = await ensureSettings(session);
  s.hashtags = s.hashtags.filter((h) => h.tag !== tag);
  await s.save({ session });
  return s.toObject();
}

/** update reward of an existing tag */
export async function updateHashtag(tag: string, reward: number, session: ClientSession) {
  const s = await ensureSettings(session);
  const h = s.hashtags.find((h) => h.tag === tag);
  if (!h) throw new Error(`Hashtag "${tag}" not found`);
  h.reward = reward;
  await s.save({ session });
  return s.toObject();
}
