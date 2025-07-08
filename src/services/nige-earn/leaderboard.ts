import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { AccountModel } from '@/db/models/account';
import { UserModel } from '@/db/models/user';
import { LedgerModel } from '@/db/models/ledger';

dayjs.extend(utc);
dayjs.extend(timezone);

// --- reuse your existing interface ---
export interface LeaderboardEntry {
  rank: number;
  accountId: string;
  balance: number;
  twitterHandle: string;
  avatarUrl: string;
  isCurrentUser: boolean;
  totalCoins?: number; // only present in monthly mode
}

// allow callers to request monthly data
interface Options {
  /** if true, run monthly (uses month/year below) */
  monthly?: boolean;
  /** 0–11, Madrid local month override */
  month?: number;
  /** full year override */
  year?: number;
}

export async function getLeaderboard(userId: string, { monthly = false, month: qMonth, year: qYear }: Options = {}): Promise<LeaderboardEntry[]> {
  // 1️⃣ Figure out “now” in Europe/Madrid
  const nowMadrid = dayjs().tz('Europe/Madrid');

  // 2️⃣ Determine if we’re doing monthly mode
  const isMonthly = monthly || (qMonth != null && qYear != null);

  // 3️⃣ Overall leaderboard (exactly your original logic)
  if (!isMonthly) {
    // load the caller
    const userAcct = await AccountModel.findById(userId).lean();
    if (!userAcct) throw new Error('Account not found');

    // compute their rank among all non-system accounts
    const higherCount = await AccountModel.countDocuments({
      system: false,
      $or: [{ balance: { $gt: userAcct.balance } }, { balance: userAcct.balance, updatedAt: { $lt: userAcct.updatedAt! } }],
    });
    const userRank = higherCount + 1;

    // top-10 legacy
    const topAccounts = await AccountModel.find({ system: false }).sort({ balance: -1, updatedAt: 1 }).limit(10).lean();

    // helper to hydrate with profile
    async function toEntry(acct: { _id: any; balance: number; updatedAt: Date }, rank: number, isMe: boolean): Promise<LeaderboardEntry> {
      const userDoc = await UserModel.findOne({ accountId: acct._id }).lean();
      return {
        rank,
        accountId: acct._id.toString(),
        balance: acct.balance,
        twitterHandle: userDoc?.username || '',
        avatarUrl: userDoc?.avatarUrl || '',
        isCurrentUser: isMe,
      };
    }

    const entries = await Promise.all(topAccounts.map((acct, i) => toEntry(acct, i + 1, acct._id.toString() === userId)));

    // if you’re outside top-10, append your own spot
    if (userRank > 10) {
      entries.push(await toEntry(userAcct, userRank, true));
    }

    return entries;
  }

  // ── Monthly leaderboard ──
  // figure out which month/year to use (0–11)
  const mx = qMonth != null ? qMonth : nowMadrid.month();
  const yy = qYear != null ? qYear : nowMadrid.year();

  // convert the Madrid‐local start/end to UTC Date objects
  const startOfMonthUtc = nowMadrid.year(yy).month(mx).startOf('month').utc().toDate();

  const startOfNextMonthUtc = nowMadrid.year(yy).month(mx).add(1, 'month').startOf('month').utc().toDate();

  // only include “reward” entries in that UTC window
  const agg = await LedgerModel.aggregate([
    {
      $match: {
        type: 'reward',
        createdAt: { $gte: startOfMonthUtc, $lt: startOfNextMonthUtc },
      },
    },
    {
      $group: {
        _id: '$creditAccount',
        total: { $sum: '$amount' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // compute your rank in that list
  const callerBucket = agg.find((b) => b._id.toString() === userId);
  const yourTotal = callerBucket?.total ?? 0;
  const higher = agg.filter((b) => b.total > yourTotal).length;
  const yourRank = higher + 1;
  const topBuckets = agg.slice(0, 10);

  // hydrate into entries
  async function toEntry(b: { _id: any; total: number }, rank: number, isMe: boolean): Promise<LeaderboardEntry> {
    const acctId = b._id.toString();
    const userDoc = await UserModel.findOne({ accountId: b._id }).lean();
    // fetch current account‐balance as well
    const acct = await AccountModel.findById(b._id).lean();
    return {
      rank,
      accountId: acctId,
      balance: acct?.balance ?? 0,
      twitterHandle: userDoc?.username || '',
      avatarUrl: userDoc?.avatarUrl || '',
      isCurrentUser: isMe,
      totalCoins: b.total,
    };
  }

  const entries = await Promise.all(topBuckets.map((b, i) => toEntry(b, i + 1, b._id.toString() === userId)));

  if (yourRank > 10) {
    entries.push(await toEntry({ _id: userId, total: yourTotal }, yourRank, true));
  }

  return entries;
}
