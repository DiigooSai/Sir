import mongoose from 'mongoose';
import { runInTransaction } from '@/utils/transaction-helper';
import { RoleModel } from '@/db/models/role';
import { ensureRewardSettings, RewardSettingsModel } from '@/db/models/reward-settings';
import { ROLES, toMakeInternal, type ROLE } from '@/constants/roles';
import { AccountModel, type IAccount } from '@/db/models/account';
import { AccountRoleModel } from '@/db/models/account-role';
import { NEST_ACCOUNT_TYPES, NestAccountModel, type NestInternalAccountTypeEnum } from '@/db/models/nige-nest/nest-account';
import { AuthProviderModel } from '@/db/models/auth-provider';
import { AssetModel, ASSETS } from '@/db/models/nige-nest/asset';
import type { ClientSession } from 'mongoose';
import { NestAvatarModel, type INestAvatar } from '@/db/models/nige-nest/nest-avatars';
import { imageExists } from '@/utils/img-utils';

// List of singleton system accounts to seed
const SINGLETONS: Array<{
  role: ROLE;
  nestType: NestInternalAccountTypeEnum;
  system: boolean;
}> = [
  { role: ROLES.TREASURY, nestType: NEST_ACCOUNT_TYPES.TREASURY, system: true },
  { role: ROLES.EXCHANGE, nestType: NEST_ACCOUNT_TYPES.EXCHANGE, system: false },
  { role: ROLES.POOL, nestType: NEST_ACCOUNT_TYPES.POOL, system: false },
];

/**
 * Ensure all collections and indexes exist before starting a transaction
 */
async function ensureAllCollections() {
  await Promise.all([
    RoleModel.createCollection(),
    RoleModel.syncIndexes(),
    AccountModel.createCollection(),
    AccountModel.syncIndexes(),
    AccountRoleModel.createCollection(),
    AccountRoleModel.syncIndexes(),
    NestAccountModel.createCollection(),
    NestAccountModel.syncIndexes(),
    AuthProviderModel.createCollection(),
    AuthProviderModel.syncIndexes(),
    AssetModel.createCollection(),
    AssetModel.syncIndexes(),
    RewardSettingsModel.createCollection(),
    RewardSettingsModel.syncIndexes(),
    NestAvatarModel.createCollection(),
    NestAvatarModel.syncIndexes(),
  ]);
}

/**
 * Top-level seed entry point.
 */
export async function seedDatabase(): Promise<void> {
  // 1) Pre-create collections & build indexes to avoid catalog changes inside transactions
  await ensureAllCollections();

  // 2) Execute all seeding logic within a single multi-document transaction
  await runInTransaction(async (session) => {
    await seedRoles(session);
    for (const opts of SINGLETONS) {
      await seedSingletonAccount(opts, session);
    }
    await seedSuperAdmin(session);
    await seedAssets(session);
    await ensureRewardSettings(session);
    await seedNestAvatars(session);
    await auditSystemAccounts(session);
  });

  console.log('🎉 All seed tasks completed');
}

// -----------------------------------------------------------------------------
// 1) Roles
// -----------------------------------------------------------------------------
async function seedRoles(session: ClientSession) {
  const roles = Object.values(ROLES).map((id) => ({
    _id: id,
    name: id.split(':')[1],
    isInternal: toMakeInternal?.includes(id as ROLE) ?? false,
  }));

  for (const role of roles) {
    const exists = await RoleModel.exists({ _id: role._id }).session(session);
    if (!exists) {
      await RoleModel.create([role], { session });
      console.log(`✓ seeded role ${role._id}`);
    }
  }
}

// -----------------------------------------------------------------------------
// 2) Singleton system accounts + NestAccount
// -----------------------------------------------------------------------------
async function seedSingletonAccount({ role, nestType, system }: (typeof SINGLETONS)[number], session: ClientSession) {
  const links = await AccountRoleModel.find({ roleId: role }).session(session).select('accountId');

  if (links.length > 1) {
    throw new Error(`Invariant: multiple links for role ${role}`);
  }

  let account: IAccount & { _id: any };

  if (links.length === 0) {
    [account] = await AccountModel.create([{ balance: 0, system, isInternal: true }], { session });
    await AccountRoleModel.create([{ accountId: account._id, roleId: role }], { session });
    console.log(`✓ created & linked ${role} → ${account._id}`);
  } else {
    const id = links[0].accountId;
    account = await AccountModel.findById(id).session(session);
    if (!account) {
      throw new Error(`Missing Account(${id}) for role ${role}`);
    }
  }

  const nests = await NestAccountModel.find({ accountType: nestType }).session(session).select('accountId');

  if (nests.length === 0) {
    await NestAccountModel.create([{ accountId: account._id, accountType: nestType }], { session });
    console.log(`✓ created NestAccount(${nestType}) for ${account._id}`);
  } else {
    const isLinked = nests.some((n) => n.accountId.equals(account._id));
    if (!isLinked) {
      await NestAccountModel.create([{ accountId: account._id, accountType: nestType }], { session });
      console.log(`✓ linked additional NestAccount(${nestType}) to ${account._id}`);
    }
  }
}

// -----------------------------------------------------------------------------
// 3) Super-admin
// -----------------------------------------------------------------------------
async function seedSuperAdmin(session: ClientSession) {
  const adminTwId = process.env.ADMIN_TWITTER_ID;
  if (!adminTwId) {
    console.warn('⚠️ Missing ADMIN_TWITTER_ID – skipping super-admin');
    return;
  }

  let link = await AuthProviderModel.findOne({
    provider: 'twitter',
    providerUserId: adminTwId,
  })
    .session(session)
    .lean();

  let accountId: any;
  if (!link) {
    const [acct] = await AccountModel.create([{ balance: 0, system: false, isInternal: true }], { session });
    accountId = acct._id;

    [link] = await AuthProviderModel.create([{ accountId, provider: 'twitter', providerUserId: adminTwId }], { session });
    console.log(`✓ created account & auth-link for ${adminTwId}`);
  } else {
    accountId = link.accountId;
  }

  const has = await AccountRoleModel.exists({
    accountId,
    roleId: ROLES.SUPER_ADMIN,
  }).session(session);
  if (!has) {
    await AccountRoleModel.create([{ accountId, roleId: ROLES.SUPER_ADMIN }], { session });
    console.log(`✓ granted SUPER_ADMIN to ${adminTwId}`);
  }
}

// -----------------------------------------------------------------------------
// 4) Assets
// -----------------------------------------------------------------------------
async function seedAssets(session: ClientSession) {
  const defaults: Array<{ _id: string; rateInUSDT: number }> = [
    { _id: ASSETS.EGG, rateInUSDT: 10 },
    { _id: ASSETS.GEM, rateInUSDT: 10 },
  ];

  for (const asset of defaults) {
    const exists = await AssetModel.exists({ _id: asset._id }).session(session);
    if (!exists) {
      await AssetModel.create([{ _id: asset._id as any, rateInUSDT: asset.rateInUSDT }], { session });
      console.log(`✓ seeded asset ${asset._id} @ ${asset.rateInUSDT} USDT`);
    }
  }
}

// -----------------------------------------------------------------------------
// 5) Audits
// -----------------------------------------------------------------------------
async function auditSystemAccounts(session: ClientSession) {
  const sys = await AccountModel.find({ system: true }).session(session).select('_id');
  if (sys.length > 1) {
    console.warn(`⚠️ Found ${sys.length} system accounts—please investigate`);
  }
}

/**
 * 6) Seed your nest avatars if missing.
 */

const PREDEFINED_AVATARS: Array<{ _id: string; name: string; imageUrl: string }> = [
  { _id: 'aryan', name: 'Aryan', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/aryan.png' },
  { _id: 'erik', name: 'Erik', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/erik.png' },
  { _id: 'felix', name: 'Felix', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/felix.png' },
  { _id: 'jabari', name: 'Jabari', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/jabari.png' },
  { _id: 'kairos', name: 'Kairos', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/kairos.png' },
  { _id: 'orion', name: 'Orion', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/orion.png' },
  { _id: 'veer', name: 'Veer', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/veer.png' },
  { _id: 'zuberi', name: 'Zuberi', imageUrl: 'https://test-assets.nigeglobal.com/nige-nest/avatars/zuberi.png' },
];
export async function seedNestAvatars(session: ClientSession): Promise<void> {
  for (const avatar of PREDEFINED_AVATARS) {
    // 1️⃣ Skip if already in DB
    const exists = await NestAvatarModel.exists({ _id: avatar._id }).session(session);
    if (exists) continue;

    // 2️⃣ Verify the remote image HEAD before seeding
    const ok = await imageExists(avatar.imageUrl);
    if (!ok) {
      console.warn(`⚠️ Skipping avatar ${avatar._id}: image not reachable`);
      continue;
    }

    // 3️⃣ Create the document
    await NestAvatarModel.create([avatar], { session });
    console.log(`✓ seeded NestAvatar(${avatar._id})`);
  }
}
