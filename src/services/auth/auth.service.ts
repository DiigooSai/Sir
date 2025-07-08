import jwt from 'jsonwebtoken';
import { runInTransaction } from '@/utils/transaction-helper';
import { AuthProviderModel } from '@/db/models/auth-provider';
import { AccountModel } from '@/db/models/account';
import { UserModel } from '@/db/models/user';
import type { ClientSession } from 'mongoose';

/* twitter payload coming from hono/x */
interface TwitterUser {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
  email?: string;
}
/* twitter tokens */
interface TwitterTokens {
  token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function upsertUserAndIssueJwt(
  tw: TwitterUser,
  _tk: TwitterTokens,
  session: ClientSession
): Promise<{ jwt: string; account: typeof AccountModel.prototype }> {
  // 1️⃣ find existing link or create a brand-new account
  let accountDoc = null;
  const existing = await AuthProviderModel.findOne({
    provider: 'twitter',
    providerUserId: tw.id,
  })
    .session(session)
    .lean();

  if (existing) {
    accountDoc = await AccountModel.findById(existing.accountId).session(session);
    if (!accountDoc) throw new Error('Linked account not found');
  } else {
    [accountDoc] = await AccountModel.create([{ balance: 0 }], { session });
  }

  // 2️⃣ upsert the AuthProvider link
  await AuthProviderModel.findOneAndUpdate(
    { provider: 'twitter', providerUserId: tw.id },
    {
      $setOnInsert: {
        provider: 'twitter',
        providerUserId: tw.id,
        accountId: accountDoc._id,
      },
    },
    { upsert: true, session }
  );

  // 3️⃣ upsert the User profile
  await UserModel.findOneAndUpdate(
    { accountId: accountDoc._id },
    {
      accountId: accountDoc._id,
      username: tw.username,
      name: tw.name ?? null,
      avatarUrl: tw.profile_image_url ?? null,
    },
    { upsert: true, new: true, session }
  );

  // 4️⃣ issue our JWT
  const token = jwt.sign({ accountId: accountDoc._id.toString() }, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });

  return { jwt: token, account: accountDoc };
}
