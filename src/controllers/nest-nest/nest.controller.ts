import { BONUS } from '@/constants/giveaway-limits';
import { CONTEXT_STATE } from '@/constants/hono-context';
import { AccountModel, UserModel } from '@/db/models';
import { ASSETS } from '@/db/models/nige-nest/asset';
import { ACTIONS, AssetLedgerModel, createGiveAwaySchema } from '@/db/models/nige-nest/asset-ledger';
import { InNestEntryModel, type IInNestEntry } from '@/db/models/nige-nest/in-nest-entry';
import { createNestZodSchema, NestModel } from '@/db/models/nige-nest/nest';
import type { EditNestDTO } from '@/db/models/nige-nest/nest';
import { NestAccountModel } from '@/db/models/nige-nest/nest-account';
import { NestAvatarModel } from '@/db/models/nige-nest/nest-avatars';
import { NestIssueModel } from '@/db/models/nige-nest/nest-issues';
import { TRANSACTION_ISSUE_TYPES, TransactionIssueModel } from '@/db/models/nige-nest/transactionIssues';
import { eggGiveawayNest, gemGiveawayNest, inNest, nigeNestCoinGiveAway, unlockNest, withTxn } from '@/services/nige-nest/asset-ledger';
import {
  listAllLedgersForUser,
  listAllLedgersForUserPaged,
  listUserBreakAndSellGemLedgers,
  listUserBreakAndSellGemLedgersPaged,
  listUserEggPurchaseAndConvertLedgers,
  listUserEggPurchaseAndConvertLedgersPaged,
} from '@/services/nige-nest/asset-ledger-listing';
import { processQuizReward } from '@/services/nige-nest/lms/quiz-attempt';
import {
  archiveNest,
  checkAndGetValidNestAccount,
  checkAndGetValidNestUserAccount,
  checkUserHasUnlockedNest,
  endNest,
  getMyInNestEntries,
  getMyNestAccountDetails,
  getTotalEggsNested,
  getUserNestIds,
  getUserNestStats,
  getUserTotalNestedEggs,
  giveAwayAssetService,
  isNestLaunched,
  launchNest,
  nestCooldown,
  processNestSignupCoinBonus,
  processNestSignupEggBonus,
  processNestSignupGemBonus,
  updateMyNestProfile,
  validNestExists,
} from '@/services/nige-nest/nest';
import { ApiResponse } from '@/utils/ApiResponse';
import { normalizeEmptyToNull } from '@/utils/string-utils';
import { runInTransaction } from '@/utils/transaction-helper';
import { zQueryValidator } from '@/utils/zValidators';
import type { Context } from 'hono';
import { Schema, Types } from 'mongoose';
import type { z } from 'zod';

export async function getNestByIdController(c: Context) {
  const { nestId } = c.req.param();
  const nest = await validNestExists(nestId);
  return c.json(new ApiResponse(200, nest, 'Nest fetched successfully'), 200);
}
export async function createNestController(c: Context) {
  const {
    lastUpdatedByZone,
    nestName,
    eggPool,
    eggLimitPerPerson,
    unlockCoins,
    scheduledLaunchAt,
    scheduledNestEnd,
    scheduledCoolDownEnd,
    gemReturnMinFactor,
    gemReturnMaxFactor,
    gemReturnFactor,
    nestRisk,
  }: z.infer<typeof createNestZodSchema> = await c.req.json();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const createdNest = runInTransaction(async (session) => {
    const nest = await NestModel.create(
      [
        {
          lastUpdatedBy: accountId,
          lastUpdatedByZone,
          nestName,
          eggPool,
          ...(eggLimitPerPerson ? { eggLimitPerPerson } : {}),
          unlockCoins,
          scheduledLaunchAt,
          scheduledNestEnd,
          scheduledCoolDownEnd,
          gemReturnMinFactor,
          gemReturnMaxFactor,
          ...(gemReturnFactor ? { gemReturnFactor } : {}),
          nestRisk,
        },
      ],
      { session }
    );
    // need a schedular job
    return nest;
  });
  return c.json(new ApiResponse(201, createdNest, 'Nest created successfully'), 201);
}

export async function editNestController(c: Context) {
  const {
    nestId,
    lastUpdatedByZone,
    nestName,
    eggPool,
    eggLimitPerPerson,
    unlockCoins,
    scheduledLaunchAt,
    scheduledNestEnd,
    scheduledCoolDownEnd,
    gemReturnMinFactor,
    gemReturnMaxFactor,
    gemReturnFactor,
    nestRisk,
  }: EditNestDTO = await c.req.json();

  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;

  const updatedNest = await runInTransaction(async (session) => {
    const nest = await NestModel.findById(nestId).session(session);
    if (!nest) throw new Error(`Nest ${nestId} not found`);

    // get how many eggs are already in the nest
    // 2️⃣ load all entries
    const entries = (await InNestEntryModel.find({ nestId: new Types.ObjectId(nestId) })
      .select('_id eggCount areCooled')
      .lean()
      .exec()) as Array<IInNestEntry & { _id: Types.ObjectId }>;

    const totalEggsInNested = entries.reduce((sum, e) => sum + e.eggCount, 0);
    if (eggPool < totalEggsInNested) {
      throw new Error(`Currently ${totalEggsInNested} eggs are in the nest, you can't make pool size less than that`);
    }

    nest.lastUpdatedBy = accountId;
    nest.lastUpdatedByZone = lastUpdatedByZone;
    nest.nestName = nestName;
    nest.eggPool = eggPool;
    nest.eggLimitPerPerson = normalizeEmptyToNull(eggLimitPerPerson) as number;
    nest.unlockCoins = unlockCoins;
    nest.set('scheduledLaunchAt', new Date(scheduledLaunchAt));
    nest.set('scheduledNestEnd', new Date(scheduledNestEnd));
    nest.set('scheduledCoolDownEnd', new Date(scheduledCoolDownEnd));
    nest.gemReturnMinFactor = gemReturnMinFactor;
    nest.gemReturnMaxFactor = gemReturnMaxFactor;
    nest.gemReturnFactor = normalizeEmptyToNull(gemReturnFactor) as number;
    nest.nestRisk = nestRisk;

    await nest.save({ session });
    return nest;
  });

  return c.json(new ApiResponse(200, updatedNest, 'Nest edited successfully'), 200);
}

export async function archiveNestController(c: Context) {
  const { nestId } = await c.req.json();
  await runInTransaction(async (session) => {
    await archiveNest(nestId, session);
  });
  return c.json(new ApiResponse(200, {}, 'Nest archived successfully'), 200);
}

export const launchNestController = async (c: Context) => {
  const { nestId } = await c.req.json();

  await runInTransaction(async (session) => {
    return launchNest(nestId, session);
  });
  return c.json(new ApiResponse(200, {}, 'Nest launched successfully'), 200);
};

export const endNestController = async (c: Context) => {
  const { nestId } = await c.req.json();

  await runInTransaction(async (session) => {
    return endNest(nestId, session);
  });
  return c.json(new ApiResponse(200, {}, 'Nest ended successfully'), 200);
};

export const nestCooldownController = async (c: Context) => {
  const { nestId } = await c.req.json();

  await runInTransaction(async (session) => {
    return nestCooldown(nestId, session);
  });
  return c.json(new ApiResponse(200, {}, 'Nest cooled down successfully'), 200);
};

export const getAllNestIssuesController = async (c: Context) => {
  const issues = await NestIssueModel.find().sort({ createdAt: -1 }).lean();
  return c.json(new ApiResponse(200, issues, 'Nest issues fetched successfully'), 200);
};

export const getAllTransactionIssuesController = async (c: Context) => {
  const issues = await TransactionIssueModel.find().sort({ createdAt: -1 }).lean();
  return c.json(new ApiResponse(200, issues, 'Transaction issues fetched successfully'), 200);
};

export const resolveTransactionIssueController = async (c: Context) => {
  const { issueId } = await c.req.json();
  // find the issue id
  const issue = await TransactionIssueModel.findById(issueId);
  if (!issue) {
    return c.json(new ApiResponse(404, null, 'Issue not found'), 404);
  }
  if (issue.isResolved) {
    return c.json(new ApiResponse(400, null, 'Issue already resolved'), 400);
  }
  if (issue.issue === TRANSACTION_ISSUE_TYPES.QUIZ_ATTEMPT_REWARD) {
    const payload = {
      quizAttemptId: issue?.meta?.quizAttemptId.toString(),
      numCoins: issue?.meta?.amount,
    };
    const { success } = await processQuizReward(payload);
    if (!success) {
      throw new Error('Not enough balance in exchange account');
    }
    return c.json(new ApiResponse(200, {}, 'Transaction issue resolved successfully'), 200);
  } else if (issue.issue === TRANSACTION_ISSUE_TYPES.USER_SIGNUP_EGG_BONUS) {
    const { success } = await processNestSignupEggBonus(issue.meta.userAccountId);
    console.log('issue is ', issue, { success });
    if (!success) {
      throw new Error('Not enough balance in exchange account');
    }
    return c.json(new ApiResponse(200, {}, 'Transaction issue resolved successfully'), 200);
  } else if (issue.issue === TRANSACTION_ISSUE_TYPES.USER_SIGNUP_GEM_BONUS) {
    const { success } = await processNestSignupGemBonus(issue.meta.userAccountId);
    if (!success) {
      throw new Error('Not enough balance in exchange account');
    }
    return c.json(new ApiResponse(200, {}, 'Transaction issue resolved successfully'), 200);
  } else if (issue.issue === TRANSACTION_ISSUE_TYPES.USER_SIGNUP_COIN_BONUS) {
    const { success } = await processNestSignupCoinBonus(issue.meta.userAccountId);
    if (!success) {
      throw new Error('Not enough balance in exchange account');
    }
    return c.json(new ApiResponse(200, {}, 'Transaction issue resolved successfully'), 200);
  }
  throw new Error('Invalid issue type');
};

export async function getAllAdminNestsController(c: Context) {
  const nests = await NestModel.aggregate([
    // 1️⃣ sort newest first
    { $sort: { createdAt: -1 } },

    // 2️⃣ join in all the in-nest entries for each nest
    {
      $lookup: {
        from: InNestEntryModel.collection.name,
        localField: '_id',
        foreignField: 'nestId',
        as: 'entries',
      },
    },

    // 3️⃣ sum up the eggCount on that joined array
    {
      $addFields: {
        totalNestedEggs: { $sum: '$entries.eggCount' },
      },
    },

    // 4️⃣ project exactly your existing fields + new metric
    {
      $project: {
        _id: 1,
        nestName: 1,
        eggPool: 1,
        eggLimitPerPerson: 1,
        nestRisk: 1,

        isLaunched: 1,
        isNestEnded: 1,
        isCoolDownEnded: 1,

        scheduledLaunchAt: 1,
        scheduledNestEnd: 1,
        scheduledCoolDownEnd: 1,

        unlockCoins: 1,
        gemReturnFactor: 1,
        gemReturnMaxFactor: 1,
        gemReturnMinFactor: 1,

        createdAt: 1,
        lastUpdatedBy: 1,
        lastUpdatedByZone: 1,
        updatedAt: 1,
        archivedAt: 1,

        totalNestedEggs: 1,
      },
    },
  ]);

  return c.json(new ApiResponse(200, nests, 'Nests fetched successfully'), 200);
}

export async function getAllUserNestsController(c: Context) {
  // 0️⃣ Make sure the user is authenticated
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }

  // 1️⃣ aggregate all live nests + totalNestedEggs
  const nests = await NestModel.aggregate([
    { $match: { archivedAt: null } },

    {
      $lookup: {
        from: InNestEntryModel.collection.name,
        localField: '_id',
        foreignField: 'nestId',
        as: 'entries',
      },
    },
    {
      $addFields: {
        totalNestedEggs: { $sum: '$entries.eggCount' },
      },
    },

    { $sort: { createdAt: -1 } },

    {
      $project: {
        _id: 1,
        nestName: 1,
        eggPool: 1,
        eggLimitPerPerson: 1,
        nestRisk: 1,

        isLaunched: 1,
        isNestEnded: 1,
        isCoolDownEnded: 1,

        scheduledLaunchAt: 1,
        scheduledNestEnd: 1,
        scheduledCoolDownEnd: 1,

        unlockCoins: 1,
        gemReturnMaxFactor: 1,
        gemReturnMinFactor: 1,

        createdAt: 1,
        lastUpdatedBy: 1,
        lastUpdatedByZone: 1,
        updatedAt: 1,
        archivedAt: 1,

        totalNestedEggs: 1,
      },
    },
  ]);

  // 2️⃣ For each nest, check if this user has unlocked it
  const enriched = await Promise.all(
    nests.map(async (nest) => {
      const hasUnlock = await checkUserHasUnlockedNest(accountId, nest._id.toString());
      return { ...nest, hasUnlock };
    })
  );

  // 3️⃣ Return
  return c.json(new ApiResponse(200, enriched, 'Nests fetched successfully'), 200);
}

export async function getSpecificUserNestsController(c: Context) {
  const { _id: nestId } = c.req.param();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }

  // 1️⃣ see if this user has unlocked the nest
  const hasUnlock = await checkUserHasUnlockedNest(accountId, nestId);

  // 2️⃣ aggregate a single nest + its totalNestedEggs
  const [nest] = await NestModel.aggregate([
    { $match: { _id: new Types.ObjectId(nestId) } },
    {
      $lookup: {
        from: InNestEntryModel.collection.name,
        localField: '_id',
        foreignField: 'nestId',
        as: 'entries',
      },
    },
    {
      $addFields: {
        totalNestedEggs: { $sum: '$entries.eggCount' },
      },
    },
    {
      $project: {
        _id: 1,
        nestName: 1,
        eggPool: 1,
        eggLimitPerPerson: 1,
        nestRisk: 1,

        isLaunched: 1,
        isNestEnded: 1,
        isCoolDownEnded: 1,

        scheduledLaunchAt: 1,
        scheduledNestEnd: 1,
        scheduledCoolDownEnd: 1,

        unlockCoins: 1,
        gemReturnMaxFactor: 1,
        gemReturnMinFactor: 1,

        createdAt: 1,
        lastUpdatedBy: 1,
        lastUpdatedByZone: 1,
        updatedAt: 1,
        archivedAt: 1,
        totalNestedEggs: 1,
      },
    },
  ]);

  if (!nest) {
    return c.json(new ApiResponse(404, null, `Nest ${nestId} not found`), 404);
  }

  // 3️⃣ merge in the unlock flag
  const result = {
    ...nest,
    hasUnlock,
  };

  return c.json(new ApiResponse(200, result, 'Nest fetched successfully'), 200);
}

export async function unlockNestController(c: Context) {
  const { nestId } = await c.req.json();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }

  const nest = await NestModel.findById(nestId, 'isLaunched unlockCoins').lean();
  if (!nest) {
    return c.json(new ApiResponse(404, null, 'Nest not found'), 404);
  }
  if (await isNestLaunched(nestId)) {
    return c.json(new ApiResponse(400, null, 'Cannot unlock: already launched'), 400);
  }

  const hasNA = await NestAccountModel.exists({ accountId }).lean();
  if (!hasNA) {
    return c.json(new ApiResponse(400, null, 'No nest account found'), 400);
  }

  // perform unlock + ledger write; errors propagate to your global handler
  const result = await unlockNest({
    accountId,
    nestId,
    amount: nest.unlockCoins,
  });

  return c.json(
    new ApiResponse(
      200,
      {
        unlockEntryId: result.entryId,
        assetLedgerId: result[ACTIONS.UNLOCK_NEST],
      },
      'Nest unlocked successfully'
    ),
    200
  );
}

export async function inNestController(c: Context) {
  const { _id } = c.req.param();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const { eggCount } = await c.req.json();
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }
  const nestAccount = await checkAndGetValidNestAccount(accountId);
  const nest = await validNestExists(_id);

  // check if nest is launched
  const alreadyLaunched = await isNestLaunched(_id);
  if (alreadyLaunched) {
    return c.json(new ApiResponse(400, null, 'Cannot In-Nest: Nest already launched'), 400);
  }

  //  user has unlocked this nest
  const hasUnlock = await checkUserHasUnlockedNest(accountId, _id);
  if (!hasUnlock) {
    return c.json(new ApiResponse(400, null, 'Nest not unlocked'), 400);
  }

  //  check if nest has space for these eggs
  const totalNestedEggs = await getTotalEggsNested(_id);
  if (totalNestedEggs + eggCount > nest.eggPool) {
    return c.json(new ApiResponse(400, null, 'Not enough space in nest'), 400);
  }

  // if per person limit is set, check if user has reached limit
  if (!!nest.eggLimitPerPerson) {
    const userTotalNestedEggsCount = await getUserTotalNestedEggs(accountId, _id);
    if (userTotalNestedEggsCount + eggCount > nest.eggLimitPerPerson) {
      return c.json(new ApiResponse(400, null, 'Nesting limit reached'), 400);
    }
  }

  // check if user has sufficient egg balance
  if (nestAccount.eggs < eggCount) {
    return c.json(new ApiResponse(400, null, 'Insufficient egg balance'), 400);
  }

  // good to go
  const entry = inNest({ nestId: _id, accountId, eggCount });

  return c.json(new ApiResponse(200, entry, 'In Nest order has been placed successfully'), 200);
}

export const getMyInNestEntriesController = async (c: Context) => {
  const { nestId } = c.req.param();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }
  await checkAndGetValidNestAccount(accountId);
  const entries = await getMyInNestEntries(accountId, nestId);
  return c.json(new ApiResponse(200, entries, 'In Nest orders fetched successfully'), 200);
};

export async function getMyNestAccountDetailsController(c: Context) {
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }

  const projections = {
    _id: true,
    balance: true,
    system: true,
    isInternal: true,
    walletId: true,

    accountId: true,
    eggs: true,
    gems: true,
    accountType: true,

    isGreeted: true,
    isTutorialGiven: true,
    isDisclaimerGiven: true,
    displayName: true,
    currentAvatar: true,
    isSignUpBonusEggGiven: true,
    isSignUpBonusGemGiven: true,
    isSignUpBonusCoinGiven: true,
  } as const;

  const result = await getMyNestAccountDetails(accountId, projections);

  // rename _id → nestAccountId
  const { _id: nestAccountId, ...rest } = result;

  return c.json(
    new ApiResponse(
      200,
      {
        nestAccountId,
        ...rest,
      },
      'Account details fetched successfully'
    ),
    200
  );
}
export async function updateMyNestProfileController(c: Context) {
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }
  const { walletId, isGreeted, isTutorialGiven, isDisclaimerGiven, displayName, currentAvatar, isSignUpBonusGiven, promocode } = await c.req.json();

  const result = await updateMyNestProfile(accountId, {
    walletId,
    isGreeted,
    isTutorialGiven,
    isDisclaimerGiven,
    displayName,
    currentAvatar,
    isSignUpBonusGiven,
    promocode,
  });

  return c.json(new ApiResponse(200, result, 'Profile updated successfully'), 200);
}
export async function getMyNestSignUpBonusController(c: Context) {
  return c.json(new ApiResponse(200, BONUS, 'Not authenticated'), 200);
}

export async function getMyNestsController(c: Context) {
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }

  // 1) Which nests does the user participate in?
  const nestIds = await getUserNestIds(accountId);
  if (nestIds.length === 0) {
    return c.json(new ApiResponse(200, [], 'No nests found for this user'), 200);
  }

  // 2) Fetch nest metadata
  const nests = await NestModel.find({ _id: { $in: nestIds } })
    .sort({ createdAt: -1 })
    .select({
      _id: 1,
      nestName: 1,
      eggPool: 1,
      eggLimitPerPerson: 1,
      nestRisk: 1,
      isLaunched: 1,
      isNestEnded: 1,
      isCoolDownEnded: 1,
      scheduledLaunchAt: 1,
      scheduledNestEnd: 1,
      scheduledCoolDownEnd: 1,
      unlockCoins: 1,
      gemReturnMaxFactor: 1,
      gemReturnMinFactor: 1,
      createdAt: 1,
      lastUpdatedBy: 1,
      lastUpdatedByZone: 1,
      updatedAt: 1,
      archivedAt: 1,
    })
    .lean()
    .exec();

  // 3) Fetch per-nest stats and attach them
  const statsByNest = await getUserNestStats(accountId, nestIds);
  const myNests = nests.map((nest) => {
    const key = nest._id.toString();
    const { totalEggs = 0, totalOrders = 0 } = statsByNest[key] || {};
    return {
      ...nest,
      totalEggsNested: totalEggs,
      totalOrders: totalOrders,
    };
  });

  return c.json(new ApiResponse(200, myNests, 'My nests fetched successfully'), 200);
}

export async function getAllNestAvatarsController(c: Context) {
  const avatars = await NestAvatarModel.find().lean();
  return c.json(new ApiResponse(200, avatars, 'Avatars fetched successfully'));
}

export async function clearMyNestProfileController(c: Context) {
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!accountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }
  await runInTransaction(async (s) => {
    // get the nest account
    const nestAccount = await NestAccountModel.findOne({ accountId }).session(s);
    if (!nestAccount) {
      return c.json(new ApiResponse(404, null, 'Nest account not found'), 404);
    }
    nestAccount.isGreeted = false;
    nestAccount.isTutorialGiven = false;
    nestAccount.isDisclaimerGiven = false;
    nestAccount.displayName = null;
    nestAccount.currentAvatar = null;
    nestAccount.isSignUpBonusGiven = false;
    (await nestAccount.save()).$session(s);

    // get the account
    const account = await AccountModel.findOne({ _id: accountId }).session(s);
    if (!account) {
      return c.json(new ApiResponse(404, null, 'Account not found'), 404);
    }
    account.walletId = null;
    (await account.save()).$session(s);
  });
  return c.json(new ApiResponse(200, {}, 'Avatars fetched successfully'));
}

export async function nestGiveAwayController(c: Context) {
  const { assetId, amount, twitterUserName, giveawayName } = (await c.req.json()) as z.infer<typeof createGiveAwaySchema>;
  const adminAccountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  if (!adminAccountId) {
    return c.json(new ApiResponse(401, null, 'Not authenticated'), 401);
  }

  // use twitter user name to find the twitter account id
  const twitterAccountId = await UserModel.findOne({ username: twitterUserName }).select('accountId').lean();
  if (!twitterAccountId) {
    return c.json(new ApiResponse(400, null, 'Twitter user not found'), 400);
  }

  const result = await giveAwayAssetService({
    assetId,
    createdByAccountId: adminAccountId,
    accountId: twitterAccountId?.accountId,
    giveawayName,
    amount,
  });
  return c.json(new ApiResponse(200, result, 'Giveaway successful'));
}

export async function getUserLedgerAllController(c: Context) {
  // by the time we get here, page/pageSize are already validated
  const { page, pageSize } = c.req.query();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;

  const { total, entries } = await listAllLedgersForUserPaged(accountId, +page, +pageSize);

  const totalPages = Math.ceil(total / +pageSize);
  return c.json(
    new ApiResponse(200, {
      entries,
      meta: { total, page, pageSize, totalPages },
    })
  );
}

export async function getUserLedgerMarketPlaceController(c: Context) {
  const { page, pageSize } = c.req.query();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;

  const { total, entries } = await listUserBreakAndSellGemLedgersPaged(accountId, +page, +pageSize);

  const totalPages = Math.ceil(total / +pageSize);
  return c.json(
    new ApiResponse(200, {
      entries,
      meta: { total, page, pageSize, totalPages },
    })
  );
}
export async function getUserLedgerBuyConvertController(c: Context) {
  const { page, pageSize } = c.req.query();
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;

  const { total, entries } = await listUserEggPurchaseAndConvertLedgersPaged(accountId, +page, +pageSize);

  const totalPages = Math.ceil(total / +pageSize);
  return c.json(
    new ApiResponse(200, {
      entries,
      meta: { total, page, pageSize, totalPages },
    })
  );
}
