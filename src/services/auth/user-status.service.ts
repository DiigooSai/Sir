import { UserModel } from '@/db/models/user';
import { AccountModel } from '@/db/models/account';

/** What we return in every case */
export interface CommonDetails {
  account: { _id: string; balance: number };
  profile: { _id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

/** Additional Nige-Link payload */
export interface LinkDetails {}

/** Placeholder for future Nige-Earn payload */
export interface EarnDetails {
  // e.g. rewardSettings?: IRewardSettings;
}

/** Fetch only the common bits */
export async function fetchCommonDetails(accountId: string): Promise<CommonDetails> {
  const acct = await AccountModel.findById(accountId).select('_id balance').lean();
  if (!acct) throw new Error('Account not found');

  const profile = await UserModel.findOne({ accountId }).select('_id username name avatarUrl').lean();

  return {
    account: { _id: acct._id.toString(), balance: acct.balance },
    profile: profile
      ? {
          _id: profile._id.toString(),
          username: profile.username,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        }
      : null,
  };
}

/** If app=nige-link, fetch the org-credentials */
export async function fetchLinkDetails(accountId: string): Promise<LinkDetails> {
  return {};
}

/** If app=nige-earn, placeholder until we add earn-specific data */
export function fetchEarnDetails(): EarnDetails {
  return {
    // nothing yet
  };
}
