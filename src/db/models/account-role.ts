import { Schema, Document, Model } from 'mongoose';
import { createModel, createSchema } from '../base';
import { AccountModel } from './account';
import { RoleModel } from './role';
import { ROLES } from '@/constants';

export interface IAccountRole {
  accountId: Schema.Types.ObjectId;
  roleId: string;
}

// 1️⃣ Define the schema
const AccountRoleSchema = createSchema<IAccountRole>({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  roleId: { type: String, ref: 'Role', required: true },
});

// 2️⃣ DOCUMENT‐LEVEL VALIDATION: pre('validate')
AccountRoleSchema.pre('validate', async function (this: Document & IAccountRole, next) {
  try {
    // Grab the current transaction session (if any) that .save({ session }) passed in:
    const session = this.$session();

    // Look up Account + Role in the same session, so we see uncommitted inserts:
    const [account, role] = await Promise.all([
      AccountModel.findById(this.accountId).session(session),
      RoleModel.findById(this.roleId).session(session),
    ]);

    if (!account) throw new Error('Account not found');
    if (!role) throw new Error('Role not found');

    // account can have multiple roles
    // if any of the roles is "ecosystem:superAdmin" | "ecosystem:admin" | "ecosystem:treasury" then we will skip the ai !== ri check
    // get all roles of account
    const accountRoles = await AccountRoleModel.find({ accountId: this.accountId }).select('roleId').lean();
    const roles = accountRoles.map((role) => role.roleId);

    if (!roles.includes(ROLES.SUPER_ADMIN) && !roles.includes(ROLES.ADMIN) && !roles.includes(ROLES.TREASURY)) {
      // Ensure isInternal flags match:
      const ai = !!account.isInternal;
      const ri = !!role.isInternal;
      if (ai !== ri) {
        throw new Error('Account.isInternal must match Role.isInternal');
      }
    }

    next();
  } catch (err) {
    next(err as any);
  }
});

// 3️⃣ QUERY‐LEVEL VALIDATION: Extract session from query options
async function validateInternalMatch(
  this: { getUpdate: () => Partial<IAccountRole>; getQuery: () => any; getOptions: () => any; model: Model<any> },
  next: (err?: Error) => void
) {
  try {
    // In Mongoose ≥6, this.getOptions().session is where the session lives if you passed
    // { session } into findOneAndUpdate(...) or updateOne(...):
    const session = this.getOptions().session as any;

    const update = this.getUpdate() as Partial<IAccountRole>;
    let { accountId, roleId } = update;

    // If either accountId or roleId is missing in the update payload, pull from existing doc:
    if (!accountId || !roleId) {
      const existing = await this.model.findOne(this.getQuery()).session(session);
      if (!existing) throw new Error('Document not found');
      accountId ||= existing.accountId;
      roleId ||= existing.roleId;
    }

    // Now fetch both records in the same session snapshot:
    const [account, role] = await Promise.all([AccountModel.findById(accountId).session(session), RoleModel.findById(roleId).session(session)]);

    if (!account) throw new Error('Account not found');
    if (!role) throw new Error('Role not found');

    // account can have multiple roles
    // if any of the roles is "ecosystem:superAdmin" | "ecosystem:admin" | "ecosystem:treasury" then we will skip the ai !== ri check
    // get all roles of account
    const accountRoles = await AccountRoleModel.find({ accountId: accountId }).select('roleId').lean();
    const roles = accountRoles.map((role) => role.roleId);

    if (!roles.includes(ROLES.SUPER_ADMIN) && !roles.includes(ROLES.ADMIN) && !roles.includes(ROLES.TREASURY)) {
      if (!!account.isInternal !== !!role.isInternal) {
        throw new Error('Account.isInternal must match Role.isInternal');
      }
    }
    next();
  } catch (err) {
    next(err as any);
  }
}

AccountRoleSchema.pre('findOneAndUpdate', validateInternalMatch);
AccountRoleSchema.pre('updateOne', validateInternalMatch);

// 4️⃣ Export the model
export const AccountRoleModel = createModel<IAccountRole>('AccountRole', AccountRoleSchema);
