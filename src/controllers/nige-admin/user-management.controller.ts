import { AccountModel, AccountRoleModel, RoleModel, UserModel } from '@/db/models';
import { InternalCredentialsModel } from '@/db/models/internal-credentials';
import { ApiResponse } from '@/utils/ApiResponse';
import { runInTransaction } from '@/utils/transaction-helper';
import type { Context } from 'hono';

export async function getAllAccountsController(c: Context) {
  // 1️⃣ Grab raw query strings
  const { page = '1', pageSize = '50', isInternal } = c.req.query();

  // 2️⃣ Parse + clamp pagination
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const ps = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 500);
  const skip = (pg - 1) * ps;

  let total = 0;
  let entries: any[] = [];

  if (isInternal === 'true') {
    //
    // ─── CASE A: FETCH INTERNAL CREDENTIALS + ACCOUNT + ROLES ───────────────────────
    //

    // 3A.1️⃣ Count only those InternalCredentials where archivedAt is null
    total = await InternalCredentialsModel.countDocuments({ archivedAt: null });

    // 3A.2️⃣ Aggregate pipeline:
    //
    //   • Filter InternalCredentials.archivedAt === null
    //   • Sort by createdAt descending
    //   • Skip / limit for pagination
    //   • Lookup corresponding Account
    //   • Ensure account.isInternal === true
    //   • Lookup AccountRole → Role → extract role._id[]
    //   • Project only the fields we need
    //
    entries = await InternalCredentialsModel.aggregate([
      // Step 1: filter out archived credentials
      { $match: { archivedAt: null } },

      // Step 2: newest first
      { $sort: { createdAt: -1 } },

      // Step 3: pagination
      { $skip: skip },
      { $limit: ps },

      // Step 4: bring in the Account document
      {
        $lookup: {
          from: 'accounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },

      // Step 5: ensure account.isInternal === true
      { $match: { 'account.isInternal': true } },

      // Step 6: lookup AccountRole documents to find all roles for this account
      {
        $lookup: {
          from: 'accountroles',
          localField: 'account._id',
          foreignField: 'accountId',
          as: 'accountRoles',
        },
      },

      // Step 7: lookup Role documents so we can pull out role._id
      {
        $lookup: {
          from: 'roles',
          localField: 'accountRoles.roleId',
          foreignField: '_id',
          as: 'roles',
        },
      },

      // Step 8: final projection
      {
        $project: {
          // credentials’ own fields
          _id: 1,
          username: 1,
          createdAt: 1,

          // embed the account’s key fields
          account: {
            _id: '$account._id',
            balance: '$account.balance',
            system: '$account.system',
            isInternal: '$account.isInternal',
          },

          // roles → array of ObjectId
          roles: '$roles._id',
        },
      },
    ]);
  } else {
    //
    // ─── CASE B: FETCH EXTERNAL USERS + ACCOUNT + ROLES ─────────────────────────────
    //

    // 3B.1️⃣ Count only those User docs with archivedAt === null whose linked Account.isInternal === false
    const countResult = await UserModel.aggregate([
      // Step 1: filter out archived users
      { $match: { archivedAt: null } },

      // Step 2: bring in the Account
      {
        $lookup: {
          from: 'accounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },

      // Step 3: filter to ensure account.isInternal === false
      { $match: { 'account.isInternal': false } },

      // Step 4: just count how many remain
      { $count: 'total' },
    ]);
    total = countResult.length > 0 ? countResult[0].total : 0;

    // 3B.2️⃣ Aggregate pipeline:
    //
    //   • Filter User.archivedAt === null
    //   • Lookup Account → filter account.isInternal === false
    //   • Sort by createdAt descending (on User)
    //   • Skip / limit for pagination
    //   • Lookup AccountRole → Role → extract role._id[]
    //   • Project only the fields we need
    //
    entries = await UserModel.aggregate([
      // Step 1: filter out archived users
      { $match: { archivedAt: null } },

      // Step 2: bring in the Account
      {
        $lookup: {
          from: 'accounts',
          localField: 'accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },

      // Step 3: filter to ensure account.isInternal === false
      { $match: { 'account.isInternal': false } },

      // Step 4: newest first, based on user.createdAt
      { $sort: { createdAt: -1 } },

      // Step 5: pagination
      { $skip: skip },
      { $limit: ps },

      // Step 6: lookup all AccountRole docs for this account
      {
        $lookup: {
          from: 'accountroles',
          localField: 'account._id',
          foreignField: 'accountId',
          as: 'accountRoles',
        },
      },

      // Step 7: lookup Role docs so we can get role._id
      {
        $lookup: {
          from: 'roles',
          localField: 'accountRoles.roleId',
          foreignField: '_id',
          as: 'roles',
        },
      },

      // Step 8: final projection
      {
        $project: {
          // user’s own fields
          _id: 1,
          username: 1,
          name: 1,
          avatarUrl: 1,
          createdAt: 1,

          // embed the account’s key fields
          account: {
            _id: '$account._id',
            balance: '$account.balance',
            system: '$account.system',
            isInternal: '$account.isInternal',
          },

          // roles → array of ObjectId
          roles: '$roles._id',
        },
      },
    ]);
  }

  // 4️⃣ Compute total pages
  const totalPages = Math.ceil(total / ps);

  // 5️⃣ Return in the standard { entries, meta } shape
  return c.json(
    new ApiResponse(200, {
      entries,
      meta: { total, page: pg, pageSize: ps, totalPages },
    })
  );
}

export async function createInternalCredentials(c: Context) {
  const { username, password, roleId } = await c.req.json();

  const internalCred = await runInTransaction(async (session) => {
    // 1️⃣ Check if username already exists (in the same session)
    const existing = await InternalCredentialsModel.findOne({ username }).session(session);
    if (existing) {
      throw new Error('Username already exists');
    }

    // 2️⃣ Create a new internal Account (isInternal: true)
    const account = new AccountModel({ balance: 0, isInternal: true });
    await account.save({ session });

    // 3️⃣ Fetch the chosen Role inside the same session
    const role = await RoleModel.findById(roleId).session(session);
    if (!role) {
      throw new Error('Role not found');
    }

    // 4️⃣ Link Account ↔ Role (the pre('validate') hook will now see both docs!)
    const accountRole = new AccountRoleModel({
      accountId: account._id,
      roleId: role._id,
    });
    await accountRole.save({ session });

    // 5️⃣ Finally, create the InternalCredentials doc
    const newCred = new InternalCredentialsModel({
      username,
      password,
      accountId: account._id,
    });
    await newCred.save({ session });

    // throw new Error('Good till here');

    return {
      _id: newCred._id,
      username: newCred.username,
      accountId: newCred.accountId,
      createdAt: newCred.createdAt,
      updatedAt: newCred.updatedAt,
    };
  });

  return c.json(new ApiResponse(201, internalCred), 201);
}

export async function getOneInternalCredentialsController(c: Context) {
  console.log('entering getOneInternalCredentialsController');
  const { _id } = c.req.param(); // internal credentials id

  const result = await runInTransaction(async (session) => {
    // 1️⃣ Fetch the internal credentials doc
    const internalCred = await InternalCredentialsModel.findOne({ _id, archivedAt: null }).session(session);
    if (!internalCred) {
      throw new Error('Internal Credentials not found');
    }

    // 2️⃣ Fetch all AccountRole docs for this account
    const accountRoles = await AccountRoleModel.find({ accountId: internalCred.accountId }).session(session);

    // 3️⃣ Extract the role IDs
    const roleIds = accountRoles.map((ar) => ar.roleId);

    // 4️⃣ Fetch the corresponding Role documents
    const roles = await RoleModel.find({ _id: { $in: roleIds } })
      .session(session)
      .select({ _id: 1, name: 1, isInternal: 1 });

    return {
      _id: internalCred._id,
      username: internalCred.username,
      accountId: internalCred.accountId,
      createdAt: internalCred.createdAt,
      updatedAt: internalCred.updatedAt,
      password: internalCred.password,
      roles, // array of Role documents
    };
  });

  return c.json(new ApiResponse(200, result), 200);
}
export async function editInternalCredentials(c: Context) {
  const { _id } = c.req.param();
  const { password, roleId } = await c.req.json();

  await runInTransaction(async (session) => {
    const existingCred = await InternalCredentialsModel.findOne({ _id, archivedAt: null }).session(session);
    if (!existingCred) {
      throw new Error('Internal Credentials not found or already archived');
    }

    await InternalCredentialsModel.updateOne({ _id }, { password }, { session });

    await AccountRoleModel.deleteMany({ accountId: existingCred.accountId }, { session });

    const role = await RoleModel.findOne({ _id: roleId, isInternal: true }).session(session);
    if (!role) {
      throw new Error('Role not found or not marked internal');
    }

    const newAccountRole = new AccountRoleModel({
      accountId: existingCred.accountId,
      roleId: role._id,
    });
    await newAccountRole.save({ session });
  });

  return c.json(new ApiResponse(200, { message: 'Internal Credentials updated successfully' }), 200);
}

export async function deleteInternalCredentials(c: Context) {
  const { _id } = c.req.param();

  const deletedInternalCred = await runInTransaction(async (session) => {
    // 1️⃣ Check if username already exists (in the same session)
    const existing = await InternalCredentialsModel.findOne({ _id, archivedAt: null }).session(session);
    if (!existing) {
      throw new Error('Internal Account not found');
    }

    // remove all account roles
    await AccountRoleModel.deleteMany({ accountId: existing.accountId }).session(session);

    // there will be one single account which will be linked to the single internal credentials
    const account = await AccountModel.findOne({ _id: existing.accountId }).session(session);
    if (!account) {
      throw new Error('Account not found');
    }
    // archive the account
    await account
      .updateOne(
        { archivedAt: new Date() },
        {
          new: true,
        }
      )
      .session(session);

    // make InternalCredentials archived
    const deletedAccount = await existing
      .updateOne(
        { archivedAt: new Date() },
        {
          new: true,
        }
      )
      .session(session);

    return {
      _id: deletedAccount._id,
      username: deletedAccount.username,
      accountId: deletedAccount.accountId,
      createdAt: deletedAccount.createdAt,
      updatedAt: deletedAccount.updatedAt,
      archivedAt: deletedAccount.archivedAt,
    };
  });

  return c.json(new ApiResponse(200, deletedInternalCred), 200);
}
