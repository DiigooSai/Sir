import { AccountModel, UserModel, type IAccount } from '@/db/models';
import { InNestEntryModel, type IInNestEntry } from '@/db/models/nige-nest/in-nest-entry';
import { NestModel } from '@/db/models/nige-nest/nest';
import { NestAccountModel, type INestAccount } from '@/db/models/nige-nest/nest-account';
import { UserNestUnlockModel } from '@/db/models/nige-nest/user-nest-unlock';
import { Schema, Types, type ClientSession } from 'mongoose';
import { eggGiveawayNest, eggingEgg, eggingGem, gemGiveawayNest, nigeNestCoinGiveAway, returnNestEgg, withTxn } from './asset-ledger';
import { getExchangeAccount, getExchangeId, getNestExchangeAccount, getNestPoolAccount } from '../nige-earn/ledger';
import { NEST_ISSUE_TYPES, nestIssueEnum, NestIssueModel, type INestIssue, type NestIssueType } from '@/db/models/nige-nest/nest-issues';
import { ACTIONS, AssetLedgerModel, IntentStatusArr, type IntentStatus } from '@/db/models/nige-nest/asset-ledger';
import { z } from 'zod';
import { mongoIdZod, promoCodeZ } from '@/db/common-schemas';
import { runInTransaction } from '@/utils/transaction-helper';
import { NestAvatarModel } from '@/db/models/nige-nest/nest-avatars';
import { ASSETS, type AssetType } from '@/db/models/nige-nest/asset';
import { BONUS } from '@/constants/giveaway-limits';
import { TRANSACTION_ISSUE_TYPES, TransactionIssueModel } from '@/db/models/nige-nest/transactionIssues';
import { markTransactionIssue, resolveUserSignupCoinBonus, resolveUserSignupEggBonus, resolveUserSignupGemBonus } from './transaction-issues';
import { NestPromoCodeModel } from '@/db/models/nige-nest/nest-promocodes';
import { InfluencerModel } from '@/db/models/nige-nest/influencers';
import escapeStringRegexp from 'escape-string-regexp';

export const checkAndGetValidNestAccount = async (accountId: string) => {
  if (!accountId) {
    throw new Error('No Account Id');
  }
  const nestAccounts = await NestAccountModel.find({ accountId });
  if (nestAccounts.length === 0) {
    throw new Error(`No Nest Account found for Account Id: ${accountId}`);
  }
  if (nestAccounts.length > 1) {
    throw new Error('More than one Nest Account: Invalid');
  }
  return nestAccounts[0];
};

export const checkAndGetValidNestUserAccount = async (accountId: string) => {
  if (!accountId) {
    throw new Error('No Account Id');
  }
  const nestAccounts = await NestAccountModel.find({ accountId });
  if (nestAccounts.length === 0) {
    throw new Error(`No Nest Account found for Account Id: ${accountId}`);
  }
  if (nestAccounts.length > 1) {
    throw new Error('More than one Nest Account: Invalid');
  }
  const nestAccount = nestAccounts[0];
  // it should also have a record in user model
  const user = await UserModel.findOne({ accountId: accountId }).lean();
  if (!user) {
    throw new Error(`Now Twitter account linked to accountId: ${accountId}`);
  }
  return nestAccount;
};

export const checkUserHasUnlockedNest = async (accountId: string, nestId: string) => {
  const hasUnlock = !!(await UserNestUnlockModel.exists({ accountId, nestId }).lean());
  return hasUnlock;
};

export const validNestExists = async (nestId: string, allowArchived: boolean = false) => {
  const nest = await NestModel.findById(nestId).lean().exec();
  if (!nest) {
    throw new Error('Nest not found');
  }
  if (nest.archivedAt && !allowArchived) throw new Error(`Nest ${nest._id} is archived`);

  return nest;
};

export async function getTotalEggsNested(nestId: string): Promise<number> {
  // ensure the nest exists (throws if not)
  await validNestExists(nestId);

  // run aggregation & pull out `total`, defaulting to 0
  const [{ total = 0 } = {}] = await InNestEntryModel.aggregate([
    { $match: { nestId: new Types.ObjectId(nestId) } },
    { $group: { _id: null, total: { $sum: '$eggCount' } } },
    { $project: { _id: 0, total: 1 } },
  ]).exec();

  return total;
}

export async function getUserTotalNestedEggs(accountId: string, nestId?: string): Promise<number> {
  // 1️⃣ Validate accountId
  if (!Types.ObjectId.isValid(accountId)) {
    throw new Error('Invalid accountId');
  }

  // 2️⃣ If they asked for one nest, ensure it exists
  if (nestId !== undefined) {
    await validNestExists(nestId);
    if (!Types.ObjectId.isValid(nestId)) {
      throw new Error('Invalid nestId');
    }
  }

  // 3️⃣ Build the match filter dynamically
  const match: Record<string, any> = {
    accountId: new Types.ObjectId(accountId),
  };
  if (nestId) {
    match.nestId = new Types.ObjectId(nestId);
  }

  // 4️⃣ Aggregate
  const [{ total = 0 } = {}] = await InNestEntryModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$eggCount' },
      },
    },
    { $project: { _id: 0, total: 1 } },
  ]).exec();

  return total;
}

export async function isNestLaunched(nestId: string): Promise<boolean> {
  // ensure the nest exists (throws if not)
  const nest = await validNestExists(nestId);
  if (
    nest.isLaunched
    // || Date.now() > new Date(nest.scheduledLaunchAt).getTime()
  ) {
    return true;
  }
  return false;
}

export async function getMyInNestEntries(accountId: string, nestId: string) {
  if (nestId) {
    await validNestExists(nestId, true);
  }
  const entries = await InNestEntryModel.find({ accountId: new Types.ObjectId(accountId), ...(nestId ? { nestId: new Types.ObjectId(nestId) } : {}) })
    .lean()
    .exec();
  return entries;
}

type Projections = Partial<Record<keyof IAccount | keyof INestAccount, boolean>>;

export async function getMyNestAccountDetails(
  accountId: string,
  projections: Partial<Record<string, boolean>>
): Promise<
  Record<string, any> & {
    _id: Types.ObjectId;
    allNestedEggs: number;
    avatar: { _id: string; name: string; imageUrl: string } | null;
    twitterUsername: string | null;
    twitterName: string | null;
    twitterAvatarUrl: string | null;
  }
> {
  if (!Types.ObjectId.isValid(accountId)) {
    throw new Error('Invalid accountId');
  }

  const acctFields = ['balance', 'system', 'isInternal', 'walletId'] as const;
  const nestFields = [
    'accountId',
    'eggs',
    'gems',
    'accountType',
    'isGreeted',
    'isTutorialGiven',
    'isDisclaimerGiven',
    'displayName',
    'currentAvatar',
    'isSignUpBonusEggGiven',
    'isSignUpBonusGemGiven',
    'isSignUpBonusCoinGiven',
  ] as const;

  const accountSelect = acctFields.filter((k) => projections[k]).join(' ');
  const nestSelect = nestFields
    .filter((k) => projections[k])
    .concat('_id')
    .join(' ');

  const accountDoc = await AccountModel.findById(accountId).select(accountSelect).lean().exec();
  if (!accountDoc) throw new Error('Account not found');

  const nestDoc = await NestAccountModel.findOne({ accountId }).select(nestSelect).lean().exec();
  if (!nestDoc) throw new Error('Nest account not found');

  const [{ total: allNestedEggs = 0 } = {}] = await InNestEntryModel.aggregate([
    { $match: { accountId: new Types.ObjectId(accountId) } },
    { $group: { _id: null, total: { $sum: '$eggCount' } } },
    { $project: { _id: 0, total: 1 } },
  ]);

  let avatar = null;
  if (nestDoc.currentAvatar) {
    avatar = await NestAvatarModel.findById(nestDoc.currentAvatar).select('_id name imageUrl').lean().exec();
  }

  const user = await UserModel.findOne({ accountId }).select('username name avatarUrl').lean().exec();

  return {
    ...accountDoc,
    ...nestDoc,
    allNestedEggs,
    avatar,
    twitterUsername: user?.username ?? null,
    twitterName: user?.name ?? null,
    twitterAvatarUrl: user?.avatarUrl ?? null,
  };
}

export async function getUserNestIds(accountId: string): Promise<Types.ObjectId[]> {
  if (!Types.ObjectId.isValid(accountId)) {
    throw new Error('Invalid accountId');
  }
  const oid = new Types.ObjectId(accountId);

  const rawIds = await InNestEntryModel.distinct('nestId', { accountId: oid }).exec();

  return rawIds.map((id) => new Types.ObjectId(String(id)));
}

export async function getUserNestStats(
  accountId: string,
  nestIds: Types.ObjectId[]
): Promise<Record<string, { totalEggs: number; totalOrders: number }>> {
  if (!Types.ObjectId.isValid(accountId)) {
    throw new Error('Invalid accountId');
  }
  const oid = new Types.ObjectId(accountId);

  const agg = await InNestEntryModel.aggregate([
    { $match: { accountId: oid, nestId: { $in: nestIds } } },
    {
      $group: {
        _id: '$nestId',
        totalEggs: { $sum: '$eggCount' },
        totalOrders: { $sum: 1 },
      },
    },
  ]).exec();

  return agg.reduce((acc, { _id, totalEggs, totalOrders }) => {
    acc[_id.toString()] = { totalEggs, totalOrders };
    return acc;
  }, {} as Record<string, { totalEggs: number; totalOrders: number }>);
}

export async function launchNest(nestId: string, session?: ClientSession): Promise<void> {
  // 1️⃣ validate
  const nest = await validNestExists(nestId);
  if (nest.isLaunched) throw new Error(`Nest ${nestId} already launched`);
  if (nest.isNestEnded) throw new Error(`Nest ${nestId} already ended`);
  if (nest.isCoolDownEnded) throw new Error(`Nest ${nestId} cooldown ended`);

  await withTxn(session, async (s) => {
    const nestDoc = await NestModel.findById(nestId).session(s);
    if (!nestDoc) throw new Error(`Nest ${nestId} vanished mid-transaction`);
    nestDoc.isLaunched = true;
    await nestDoc.save({ session: s });
  });
}

export async function endNest(nestId: string, session?: ClientSession): Promise<void> {
  // 1️⃣ validate
  const nest = await validNestExists(nestId);
  if (!nest.isLaunched) throw new Error(`Nest ${nestId} not launched`);
  if (nest.isNestEnded) throw new Error(`Nest ${nestId} already ended`);
  if (nest.isCoolDownEnded) throw new Error(`Nest ${nestId} cooldown ended`);

  // 2️⃣ load entries
  const entries = (await InNestEntryModel.find({ nestId: new Types.ObjectId(nestId) })
    .select('_id eggCount areGemsDistributed')
    .lean()
    .exec()) as Array<IInNestEntry & { _id: Types.ObjectId }>;
  const totalEggs = entries.reduce((sum, e) => sum + e.eggCount, 0);

  // 3️⃣ compute gems needed
  const factor = nest.gemReturnFactor ?? nest.gemReturnMinFactor;
  const totalGemsNeeded = totalEggs * factor;

  // 4️⃣ check pool capacity
  const poolAcc = await getNestPoolAccount();
  if (totalGemsNeeded > poolAcc.gems) {
    const msg = `Insufficient pool gems for end nest ${nestId}: need ${totalGemsNeeded}, have ${poolAcc.gems}`;
    console.error(msg);
    await markNestIssue(nestId, NEST_ISSUE_TYPES.END, msg);
    throw new Error(msg);
  }

  // 5️⃣ distribute + finalize
  await withTxn(session, async (s) => {
    for (const e of entries) {
      if (e.areGemsDistributed) continue;
      // this will transfer + mark e.areGemsDistributed
      await eggingGem({ nestInvestmentId: e._id.toString(), gemReturnFactor: factor }, s);
    }

    const nestDoc = await NestModel.findById(nestId).session(s);
    if (!nestDoc) throw new Error(`Nest ${nestId} vanished mid-transaction`);
    nestDoc.isNestEnded = true;
    await nestDoc.save({ session: s });

    // resolve any “end” issues
    await resolveAllNestIssues(nestId, NEST_ISSUE_TYPES.END, s);

    // turn of the respective schedules
  });
}

export async function nestCooldown(nestId: string, session?: ClientSession): Promise<void> {
  // 1️⃣ validate nest state
  const nest = await validNestExists(nestId);
  if (!nest.isLaunched) throw new Error(`Nest ${nestId} has not launched`);
  if (!nest.isNestEnded) throw new Error(`Nest ${nestId} has not ended`);
  if (nest.isCoolDownEnded) throw new Error(`Nest ${nestId} cooldown already ended`);

  // 2️⃣ load all entries
  const entries = (await InNestEntryModel.find({ nestId: new Types.ObjectId(nestId) })
    .select('_id eggCount areCooled')
    .lean()
    .exec()) as Array<IInNestEntry & { _id: Types.ObjectId }>;

  const totalEggs = entries.reduce((sum, e) => sum + e.eggCount, 0);

  // 3️⃣ check pool capacity
  const poolAcc = await getNestPoolAccount();
  if (totalEggs > poolAcc.eggs) {
    const msg = `Insufficient pool eggs for cooldown of nest ${nestId}: need ${totalEggs}, have ${poolAcc.eggs}`;
    console.error(msg);
    await markNestIssue(nestId, NEST_ISSUE_TYPES.COOLDOWN, msg);
    throw new Error(msg);
  }

  // 4️⃣ distribute & finalize
  await withTxn(session, async (s) => {
    for (const e of entries) {
      if (e.areCooled) continue;
      // eggingEgg will transfer _and_ set `areCooled`
      await eggingEgg({ nestInvestmentId: e._id.toString() }, s);
    }

    const nestDoc = await NestModel.findById(nestId).session(s);
    if (!nestDoc) throw new Error(`Nest ${nestId} vanished mid-transaction`);
    nestDoc.isCoolDownEnded = true;
    await nestDoc.save({ session: s });

    // clear any “cooldown” issues
    await resolveAllNestIssues(nestId, NEST_ISSUE_TYPES.COOLDOWN, s);

    // turn of the respective schedules
  });
}

export async function archiveNest(nestId: string, session?: ClientSession): Promise<void> {
  // 1️⃣ load & validate flags
  const nest = await validNestExists(nestId);

  if (nest.isNestEnded) {
    throw new Error(`Nest ${nestId} has already ended; cannot archive`);
  }
  if (nest.isCoolDownEnded) {
    throw new Error(`Nest ${nestId} cooldown already ended; cannot archive`);
  }

  // 2️⃣ gather all in-nest entries (only count those not yet cancelled)
  const entries = await InNestEntryModel.find({ nestId: new Types.ObjectId(nestId) })
    .select('_id eggCount gotCancelled')
    .lean()
    .exec();
  const totalEggs = (entries as Array<IInNestEntry & { _id: Types.ObjectId }>).filter((e) => !e.gotCancelled).reduce((sum, e) => sum + e.eggCount, 0);

  // 3️⃣ check pool capacity
  const pool = await getNestPoolAccount();
  if (totalEggs > pool.eggs) {
    const msg = `Insufficient pool eggs for archiving nest ${nestId}: need ${totalEggs}, have ${pool.eggs}`;
    console.error(msg);
    await markNestIssue(nestId, NEST_ISSUE_TYPES.ARCHIVING, msg, session);
    throw new Error(msg);
  }

  // 4️⃣ do everything in one TX
  await withTxn(session, async (s) => {
    for (const entry of entries) {
      if (entry.gotCancelled) continue;
      // this will both transfer back and set entry.gotCancelled internally
      await returnNestEgg({ nestInvestmentId: entry._id.toString() }, s);
    }

    const nestDoc = await NestModel.findById(nestId).session(s);
    if (!nestDoc) throw new Error(`Nest ${nestId} vanished mid-transaction`);
    nestDoc.archivedAt = new Date();
    await nestDoc.save({ session: s });

    // resolve any open ARCHIVING issues
    await resolveAllNestIssues(nestId, NEST_ISSUE_TYPES.ARCHIVING, s);

    // turn of the respective schedules
  });
}

export async function markNestIssue(nestId: string, issue: NestIssueType, message: string, session?: ClientSession): Promise<INestIssue> {
  nestIssueEnum.parse(issue);
  await validNestExists(nestId);
  return withTxn(session, async (s) => {
    const doc = await NestIssueModel.create(
      [
        {
          nestId: new Types.ObjectId(nestId),
          issue,
          message,
          isResolved: false,
        },
      ],
      { session: s }
    );
    return doc[0];
  });
}

export async function markNestIssueResolved(issueId: string, session?: ClientSession): Promise<INestIssue> {
  return withTxn(session, async (s) => {
    const issue = await NestIssueModel.findById(issueId).session(s);
    if (!issue) {
      throw new Error(`NestIssue ${issueId} not found`);
    }
    if (issue.isResolved) {
      throw new Error(`NestIssue ${issueId} is already resolved`);
    }
    issue.isResolved = true;
    await issue.save({ session: s });
    return issue.toObject();
  });
}

export async function resolveAllNestIssues(nestId: string, issueType: NestIssueType, session?: ClientSession): Promise<number> {
  nestIssueEnum.parse(issueType);
  await validNestExists(nestId);
  return withTxn(session, async (s) => {
    const { modifiedCount } = await NestIssueModel.updateMany(
      {
        nestId: new Types.ObjectId(nestId),
        issue: issueType,
        isResolved: false,
      },
      { isResolved: true },
      { session: s }
    );
    return modifiedCount;
  });
}

export async function listSellGemIntents(status?: IntentStatus) {
  const filter: Record<string, any> = { action: ACTIONS.SELL_GEM_INTENT };
  if (status) {
    if (!IntentStatusArr.includes(status)) {
      throw new Error(`Invalid status "${status}". Must be one of ${IntentStatusArr.join(', ')}`);
    }
    filter.status = status;
  }
  return AssetLedgerModel.find(filter).sort({ createdAt: -1 }).lean().exec();
}

export const UpdateMyNestProfileInput = z
  .object({
    // on Account
    walletId: z.preprocess((val) => {
      if (typeof val === 'string') {
        return val.trim().toLowerCase();
      }
      return val; // e.g. null or undefined
    }, z.string().nullable()),

    // on NestAccount
    isGreeted: z.boolean(),
    isTutorialGiven: z.boolean(),
    isDisclaimerGiven: z.boolean(),
    displayName: z.string().nullable(),
    currentAvatar: mongoIdZod.or(z.string().min(1)).nullable(),
    isSignUpBonusGiven: z.boolean(),
    promocode: z.string().nullable(),
  })
  .partial()
  .strict();

export type UpdateMyNestProfileDTO = z.infer<typeof UpdateMyNestProfileInput>;

interface ProcessResult {
  success: boolean;
}

export async function processNestSignupEggBonus(accountId: string | Types.ObjectId, session?: ClientSession): Promise<ProcessResult> {
  const nestAccount = await NestAccountModel.findOne({ accountId }).session(session ?? null);
  if (!nestAccount) throw new Error('NestAccount not found');

  // → already given?
  if (nestAccount.isSignUpBonusEggGiven.assetLedgerId || BONUS.NEST_SIGNUP_EGG < 1) {
    await resolveUserSignupEggBonus(nestAccount.accountId.toString(), session);
    nestAccount.isSignUpBonusEggGiven.addressed = true;
    await nestAccount.save({ session });
    return { success: true };
  }

  const bonusValue = BONUS.NEST_SIGNUP_EGG;
  const exchange = await getNestExchangeAccount();

  // → insufficient eggs
  if (bonusValue > exchange.eggs) {
    await markTransactionIssue(
      {
        issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS,
        userAccountId: nestAccount.accountId.toString(),
        eggBonusAmount: bonusValue,
      },
      session
    );

    nestAccount.isSignUpBonusEggGiven.addressed = true;
    await nestAccount.save({ session });
    return { success: false };
  }

  // → perform giveaway
  const ledger = await eggGiveawayNest(
    {
      createdByAccountId: exchange.accountId,
      accountId,
      giveawayName: 'Nest Sign-up Bonus',
      amount: bonusValue,
    },
    session
  );

  nestAccount.isSignUpBonusEggGiven.assetLedgerId = ledger[ACTIONS.EGG_GIVEAWAY];
  await resolveUserSignupEggBonus(nestAccount.accountId.toString(), session);
  nestAccount.isSignUpBonusEggGiven.addressed = true;
  await nestAccount.save({ session });

  return { success: true };
}

/** GEM signup bonus */
export async function processNestSignupGemBonus(accountId: string | Types.ObjectId, session?: ClientSession): Promise<ProcessResult> {
  const nestAccount = await NestAccountModel.findOne({ accountId }).session(session ?? null);
  if (!nestAccount) throw new Error('NestAccount not found');

  if (nestAccount.isSignUpBonusGemGiven.assetLedgerId || BONUS.NEST_SIGNUP_GEM < 1) {
    await resolveUserSignupGemBonus(nestAccount.accountId.toString(), session);
    nestAccount.isSignUpBonusGemGiven.addressed = true;
    await nestAccount.save({ session });
    return { success: true };
  }

  const bonusValue = BONUS.NEST_SIGNUP_GEM;
  const exchange = await getNestExchangeAccount();

  if (bonusValue > exchange.gems) {
    await markTransactionIssue(
      {
        issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS,
        userAccountId: nestAccount.accountId.toString(),
        gemBonusAmount: bonusValue,
      },
      session
    );

    nestAccount.isSignUpBonusGemGiven.addressed = true;
    await nestAccount.save({ session });
    return { success: false };
  }

  const ledger = await gemGiveawayNest(
    {
      createdByAccountId: exchange.accountId,
      accountId,
      giveawayName: 'Nest Sign-up Bonus',
      amount: bonusValue,
    },
    session
  );

  nestAccount.isSignUpBonusGemGiven.assetLedgerId = ledger[ACTIONS.GEM_GIVEAWAY];
  await resolveUserSignupGemBonus(nestAccount.accountId.toString(), session);
  nestAccount.isSignUpBonusGemGiven.addressed = true;
  await nestAccount.save({ session });
  return { success: true };
}

/** COIN signup bonus */
export async function processNestSignupCoinBonus(accountId: string | Types.ObjectId, session?: ClientSession): Promise<ProcessResult> {
  const nestAccount = await NestAccountModel.findOne({ accountId }).session(session ?? null);
  if (!nestAccount) throw new Error('NestAccount not found');

  // you’ll need to add this field in your schema:
  if (nestAccount.isSignUpBonusCoinGiven.assetLedgerId || BONUS.NEST_SIGNUP_COIN < 1) {
    await resolveUserSignupCoinBonus(nestAccount.accountId.toString(), session);
    nestAccount.isSignUpBonusCoinGiven.addressed = true;
    await nestAccount.save({ session });
    return { success: true };
  }

  const bonusValue = BONUS.NEST_SIGNUP_COIN;
  const exchangeAcc = await getExchangeAccount();
  const exchangeId = await getExchangeId();

  // coins balance check
  if (bonusValue > exchangeAcc.balance) {
    await markTransactionIssue(
      {
        issue: TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS,
        userAccountId: accountId.toString(),
        coinBonusAmount: bonusValue,
      },
      session
    );

    nestAccount.isSignUpBonusCoinGiven.addressed = true;
    await nestAccount.save({ session });
    return { success: false };
  }

  // call your coin-giveaway fn
  const ledger = await nigeNestCoinGiveAway(
    {
      createdByAccountId: exchangeId.toString(),
      accountId,
      giveawayName: 'Nest Sign-up Bonus',
      amount: bonusValue,
    },
    session
  );

  nestAccount.isSignUpBonusCoinGiven.assetLedgerId = ledger[ACTIONS.NEST_COIN_GIVEAWAY];
  await resolveUserSignupCoinBonus(nestAccount.accountId.toString(), session);
  nestAccount.isSignUpBonusCoinGiven.addressed = true;
  await nestAccount.save({ session });

  return { success: true };
}

export async function updateMyNestProfile(
  accountId: string,
  dto: UpdateMyNestProfileDTO
): Promise<{
  accountUpdates: Partial<UpdateMyNestProfileDTO>;
  nestUpdates: Partial<UpdateMyNestProfileDTO>;
}> {
  return runInTransaction(async (session) => {
    const accountUpdates: Partial<UpdateMyNestProfileDTO> = {};

    if ('walletId' in dto) {
      // need to first check if the wallet already exists with some other account other than this one
      if (typeof dto.walletId === 'string' && dto?.walletId?.length > 30) {
        console.log('wallet trying to connect, sanity check passed', dto.walletId);
        const escaped = escapeStringRegexp(dto.walletId);

        const existing = await AccountModel.findOne({
          walletId: { $regex: `^${escaped}$`, $options: 'i' },
          accountId: { $ne: accountId },
        }).session(session);

        if (existing) {
          console.log('wallet trying to connect, sanity check failed', dto.walletId);
          throw new Error('Wallet already linked to another account');
        }
        console.log('wallet connected', dto.walletId);
        accountUpdates.walletId = dto.walletId!;
      }
    }
    if (Object.keys(accountUpdates).length) {
      const { matchedCount } = await AccountModel.updateOne({ _id: accountId }, { $set: accountUpdates }, { session });
      if (matchedCount === 0) {
        throw new Error('Account not found');
      }
    }
    const nestUpdates: Partial<UpdateMyNestProfileDTO> = {};

    if (('currentAvatar' in dto && !!dto.currentAvatar) || dto.currentAvatar === null) {
      if (!!dto.currentAvatar || dto.currentAvatar === null) {
        const exists = await NestAvatarModel.exists({ _id: dto.currentAvatar }).session(session);
        if (!exists) {
          throw new Error(`Avatar ${dto.currentAvatar} not found`);
        }
        nestUpdates.currentAvatar = dto.currentAvatar;
      } else {
        nestUpdates.currentAvatar = null;
      }
    }

    for (const key of ['isGreeted', 'isTutorialGiven', 'isDisclaimerGiven', 'displayName'] as const) {
      if (key in dto) {
        nestUpdates[key] = dto[key];
      }
    }

    if ('promocode' in dto) {
      // fetch the current addressed flag
      const existing = await NestAccountModel.findOne({ accountId }).session(session).select('promocode.addressed').lean();

      // only run the promo‐handling block if it hasn’t been addressed yet
      if (!existing?.promocode?.addressed) {
        const promoUpdate: {
          addressed: true;
          influencerId: Types.ObjectId | null;
          nestPromoCodeName: string | null;
        } = {
          addressed: true,
          influencerId: null,
          nestPromoCodeName: null,
        };

        if (!!dto.promocode) {
          const safePromoCode = promoCodeZ.safeParse(dto.promocode);
          if (safePromoCode.success) {
            const promo = await NestPromoCodeModel.findOne({ code: safePromoCode.data }).session(session);
            console.log('found promo', promo);
            if (promo) {
              console.log('came here to set promocode');
              promoUpdate.influencerId = promo.influencer;
              promoUpdate.nestPromoCodeName = promo.code;
            }
          }
        }

        nestUpdates.promocode = promoUpdate;
      }
    }

    if (Object.keys(nestUpdates).length) {
      const { matchedCount } = await NestAccountModel.updateOne({ accountId }, { $set: nestUpdates }, { session });
      if (matchedCount === 0) {
        throw new Error('NestAccount not found');
      }
    }
    // get the nestAccount
    if (!!dto.isSignUpBonusGiven) {
      await processNestSignupEggBonus(accountId, session);
      await processNestSignupGemBonus(accountId, session);
      await processNestSignupCoinBonus(accountId, session);
    }

    return { accountUpdates, nestUpdates };
  });
}

export const giveAwayAssetService = async (
  {
    assetId,
    createdByAccountId,
    accountId,
    giveawayName,
    amount,
  }: {
    assetId: AssetType;
    createdByAccountId: Schema.Types.ObjectId;
    accountId: Schema.Types.ObjectId;
    giveawayName: string;
    amount: number;
  },
  session?: ClientSession
) => {
  let result;
  const payload = {
    createdByAccountId,
    accountId,
    giveawayName,
    amount,
  };
  if (assetId === ASSETS.COIN) {
    result = await nigeNestCoinGiveAway(payload, session);
  } else if (assetId === ASSETS.EGG) {
    result = await eggGiveawayNest(payload, session);
  } else if (assetId === ASSETS.GEM) {
    result = await gemGiveawayNest(payload, session);
  } else {
    throw new Error(`Invalid assetId: ${assetId}`);
  }
  return result;
};

export const sendNestSignupBonus = async (accountId: string, session?: ClientSession) => {
  const account = await AccountModel.findById(accountId).lean();
  if (!account) {
    throw new Error('Account not found');
  }
  const nestAccount = await checkAndGetValidNestUserAccount(accountId);
  if (!!nestAccount?.isSignUpBonusEggGiven?.addressed && !!nestAccount?.isSignUpBonusGemGiven?.addressed) {
    if (nestAccount?.isSignUpBonusEggGiven?.assetLedgerId && nestAccount?.isSignUpBonusGemGiven?.assetLedgerId) {
      throw new Error(
        `Already claimed: AssetLedgerId ${nestAccount?.isSignUpBonusEggGiven?.assetLedgerId} and ${nestAccount?.isSignUpBonusGemGiven?.assetLedgerId}`
      );
    } else {
      throw new Error(`Already claimed, Signup bonus will reflect in 24-48 hours`);
    }
  }
  await runInTransaction(async (s) => {
    const exchange = await getExchangeId();
    const exchangeAcc = await getNestExchangeAccount();
    // give for those which haven't claimed
    let eggSignUpBonusLedger, gemSignUpBonusLedger;
    if (!nestAccount?.isSignUpBonusEggGiven?.addressed) {
      if (exchangeAcc.eggs < BONUS.NEST_SIGNUP_EGG) {
        // first check
      }
      eggSignUpBonusLedger = await eggGiveawayNest(
        { createdByAccountId: exchange, accountId, giveawayName: 'Nest Sign-up Bonus', amount: BONUS.NEST_SIGNUP_EGG },
        s
      );
      nestAccount.isSignUpBonusEggGiven = eggSignUpBonusLedger[ACTIONS.EGG_GIVEAWAY];
    }
    if (!nestAccount?.isSignUpBonusGemGiven?.addressed) {
      gemSignUpBonusLedger = await gemGiveawayNest(
        { createdByAccountId: exchange, accountId, giveawayName: 'Nest Sign-up Bonus', amount: BONUS.NEST_SIGNUP_GEM },
        s
      );
      nestAccount.isSignUpBonusGemGiven = gemSignUpBonusLedger[ACTIONS.GEM_GIVEAWAY];
    }
    await nestAccount.save({ session: s });
  });
};
