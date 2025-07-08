// src/scripts/top-users/top.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Types } from 'mongoose';
import { LedgerModel } from '@/db/models/ledger';
import { AccountModel } from '@/db/models/account';
import { UserModel } from '@/db/models/user';
import { AccountRoleModel } from '@/db/models/account-role';
import { ROLES } from '@/constants/roles';
import { getLogPath } from '../utils';

dayjs.extend(utc);

interface Winner {
  accountId: string;
  balance: number;
  totalCoins: number;
  userId: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

async function main() {
  // ─── Parse CLI args ─────────────────────────────
  const [, , startArg, endArg] = process.argv;
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  console.log('▶️  Received args:', { startArg, endArg });

  if (startArg) {
    const d = dayjs.utc(startArg, 'YYYY-MM-DD', true);
    console.log('   parsed startArg:', d.toISOString(), 'valid?', d.isValid());
    if (d.isValid()) startDate = d.startOf('day').toDate();
  }
  if (endArg) {
    const d = dayjs.utc(endArg, 'YYYY-MM-DD', true);
    console.log('   parsed endArg:', d.toISOString(), 'valid?', d.isValid());
    if (d.isValid()) endDate = d.add(1, 'day').startOf('day').toDate();
  }
  if (startDate && !endDate) {
    endDate = dayjs.utc().add(1, 'day').startOf('day').toDate();
  }
  const invalidRange = Boolean(startArg && !startDate) || Boolean(endArg && !endDate);
  console.log('   final window →', { start: startDate?.toISOString(), end: endDate?.toISOString(), invalidRange });

  // ─── Connect Mongo ───────────────────────────────
  const uri = process.env.MONGO_URI!;
  console.log('→ connecting to:', uri);
  await mongoose.connect(uri);
  console.log('✔️  MongoDB connected');

  let winners: Winner[] = [];
  if (!invalidRange && startDate && endDate) {
    winners = await getTop50Winners(startDate, endDate);
  } else {
    console.warn('🟠 Invalid or missing date range — skipping aggregation');
  }

  // ─── Log files ───────────────────────────────────
  const suf =
    startDate && endDate ? `${dayjs.utc(startDate).format('YYYYMMDD')}_${dayjs.utc(endDate).subtract(1, 'ms').format('YYYYMMDD')}` : 'nodata';

  logJSON(suf, winners);
  logCSV(suf, winners);

  console.log(`✅ Fetched and logged ${winners.length} winners.`);
  await mongoose.disconnect();
  console.log('🔌 MongoDB disconnected');
  process.exit(0);
}

async function getTop50Winners(start: Date, end: Date): Promise<Winner[]> {
  console.log(`🔎 Aggregating rewards by createdAt between ${start.toISOString()} and ${end.toISOString()}`);

  // 1) find all earn-user accountIds
  const roles = await AccountRoleModel.find({ roleId: ROLES.NIGE_EARN_USER }).select('accountId').lean();
  const earnIds = roles.map((r) => new Types.ObjectId(r.accountId));

  // 2) count for debug
  const totalCount = await LedgerModel.countDocuments({
    type: 'reward',
    creditAccount: { $in: earnIds },
    createdAt: { $gte: start, $lt: end },
  });
  console.log(`   → matched ledger entries: ${totalCount}`);

  // 3) aggregate top 50
  const agg = await LedgerModel.aggregate([
    {
      $match: {
        type: 'reward',
        creditAccount: { $in: earnIds },
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: '$creditAccount', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
    { $limit: 50 },
  ]);
  console.log(`   → top buckets sample:`, agg.slice(0, 5), agg.length > 5 ? '…' : '');

  if (agg.length === 0) return [];

  // 4) fetch balances & users
  const acctIds = agg.map((b) => b._id);
  const [accounts, users] = await Promise.all([
    AccountModel.find({ _id: { $in: acctIds } })
      .select({ _id: 1, balance: 1 })
      .lean(),
    UserModel.find({ accountId: { $in: acctIds } })
      .select({ _id: 1, accountId: 1, name: 1, username: 1, avatarUrl: 1 })
      .lean(),
  ]);
  const acctMap = new Map(accounts.map((a) => [String(a._id), a]));
  const userMap = new Map(users.map((u) => [String(u.accountId), u]));

  // 5) build winner list
  return agg.map((b) => {
    const id = b._id.toString();
    const acct = acctMap.get(id)!;
    const u = userMap.get(id) || null;
    return {
      accountId: id,
      balance: acct.balance,
      totalCoins: b.total,
      userId: u?._id.toString() || null,
      name: u?.name || null,
      username: u?.username || null,
      avatarUrl: u?.avatarUrl || null,
    };
  });
}

// ─── file logging ───────────────────────────────────
const logDir = path.join(__dirname, getLogPath());
fs.mkdirSync(logDir, { recursive: true });

function logJSON(suffix: string, data: any) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fn = `top50Winners_${suffix}_${ts}.json`;
  const fp = path.join(logDir, fn);
  fs.writeFileSync(fp, JSON.stringify({ timestamp: new Date(), data }, null, 2), 'utf-8');
  console.log(`→ JSON logged to ${fp}`);
}

function logCSV(suffix: string, data: Winner[]) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fn = `top50Winners_${suffix}_${ts}.csv`;
  const fp = path.join(logDir, fn);
  const escapeCSV = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ['accountId', 'balance', 'totalCoins', 'userId', 'name', 'username', 'avatarUrl'];
  const rows = [headers.join(',')];
  data.forEach((i) => {
    const vals = [i.accountId, i.balance, i.totalCoins, i.userId, i.name, i.username, i.avatarUrl];
    rows.push(vals.map(escapeCSV).join(','));
  });
  fs.writeFileSync(fp, rows.join('\n'), 'utf-8');
  console.log(`→ CSV logged to ${fp}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
