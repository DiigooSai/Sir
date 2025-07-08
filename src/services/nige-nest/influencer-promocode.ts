import { Types, type ClientSession } from 'mongoose';
import { runInTransaction } from '@/utils/transaction-helper';
import { InfluencerModel } from '@/db/models/nige-nest/influencers';
import { NestPromoCodeModel } from '@/db/models/nige-nest/nest-promocodes';

export async function createInfluencer({ name }: { name: string }, session?: ClientSession) {
  return runInTransaction(async (s) => {
    const [doc] = await InfluencerModel.create([{ name }], { session: session ?? s });
    return doc;
  });
}
export async function updateInfluencer({ influencerId, name }: { influencerId: string; name: string }, session?: ClientSession) {
  return runInTransaction(async (s) => {
    const inf = await InfluencerModel.findById(influencerId).session(s);
    if (!inf) throw new Error('Influencer not found');
    inf.name = name;
    await inf.save({ session: session ?? s });
    return inf;
  });
}

export async function getInfluencerById({ influencerId }: { influencerId: string }) {
  return runInTransaction(async (s) => {
    const inf = await InfluencerModel.findById(influencerId).lean().session(s);
    if (!inf) throw new Error('Influencer not found');
    const codes = await NestPromoCodeModel.find({ influencer: inf._id }).lean().session(s);
    return { ...inf, promoCodes: codes };
  });
}

export async function getAllInfluencers() {
  return runInTransaction(async (s) => {
    const infs = await InfluencerModel.find().lean().session(s);
    const ids = infs.map((i) => i._id);
    const codes = await NestPromoCodeModel.find({ influencer: { $in: ids } })
      .lean()
      .session(s);
    const map = codes.reduce<Record<string, any[]>>((acc, pc) => {
      const key = pc.influencer.toString();
      (acc[key] = acc[key] || []).push(pc);
      return acc;
    }, {});
    return infs.map((i) => ({ ...i, promoCodes: map[i._id.toString()] || [] }));
  });
}

export async function addPromoCode({ influencerId, code }: { influencerId: string; code: string }, session?: ClientSession) {
  return runInTransaction(async (s) => {
    const influencer = await InfluencerModel.findById(influencerId).session(s);
    if (!influencer) throw new Error('Influencer not found');
    const [promo] = await NestPromoCodeModel.create([{ code, influencer: new Types.ObjectId(influencerId) }], { session: session ?? s });
    return promo;
  });
}

export async function removePromoCode({ promoCodeId }: { promoCodeId: string }, session?: ClientSession) {
  return runInTransaction(async (s) => {
    const res = await NestPromoCodeModel.deleteOne({ _id: new Types.ObjectId(promoCodeId) }, { session: session ?? s });
    if (res.deletedCount === 0) {
      throw new Error('Promo code not found');
    }
    return { success: true };
  });
}
