import type { Context } from 'hono';
import jwt from 'jsonwebtoken';
import { setSignedCookie, deleteCookie, getSignedCookie } from 'hono/cookie';
import { ROLES, type ROLE } from '@/constants/roles';
import { ApiResponse } from '@/utils/ApiResponse';
import { AuthProviderModel } from '@/db/models/auth-provider';
import { AccountRoleModel } from '@/db/models/account-role';
import { COOKIE_OPTS } from '@/configs/cookie-config';
import { CONTEXT_STATE, COOKIE_STRINGS } from '@/constants/hono-context';
import { AccountModel, UserModel } from '@/db/models';
import { ROLE_PERMS } from '@/constants';

export async function adminLoginCallback(c: Context) {
  const twTokens = c.get(CONTEXT_STATE.TOKEN) as { token: string; refresh_token?: string; expires_in: number };
  const twProfile = c.get(CONTEXT_STATE.USER_X) as { id: string; username: string };

  console.log('🔐 Received Twitter OAuth tokens (admin):', twTokens);

  // 1) Look up which account is tied to this Twitter ID
  const provider = await AuthProviderModel.findOne({
    provider: 'twitter',
    providerUserId: twProfile.id,
  }).lean();

  if (!provider) {
    return c.json(new ApiResponse(404, null, 'No linked admin account'), 404);
  }

  // 2) Gather their roles
  const roles = await AccountRoleModel.find({ accountId: provider.accountId }).lean();
  const roleIds = roles.map((r) => r.roleId as ROLE);

  const returnTo = (await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_RETURN)) || '/';

  // pick the highest privilege
  const role = roleIds.includes(ROLES.SUPER_ADMIN) ? ROLES.SUPER_ADMIN : roleIds.includes(ROLES.ADMIN) ? ROLES.ADMIN : null;

  if (!role) {
    return c.redirect(returnTo);
  }

  // 3) Sign JWT
  const token = jwt.sign({ accountId: provider.accountId.toString(), role }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  // 4) Persist admin cookie
  await setSignedCookie(c, COOKIE_STRINGS.NIGECOIN_JWT, token, process.env.COOKIE_SECRET!, COOKIE_OPTS);

  // 5) Clean up
  deleteCookie(c, COOKIE_STRINGS.O_AUTH_APP, COOKIE_OPTS);
  deleteCookie(c, COOKIE_STRINGS.O_AUTH_RETURN, COOKIE_OPTS);
  deleteCookie(c, COOKIE_STRINGS.LOGIN_AS, COOKIE_OPTS);

  // 6) Redirect back to admin UI
  return c.redirect(returnTo);
}

/**
 * Simple logout
 */
// export async function adminLogout(c: Context) {
//   deleteCookie(c, COOKIE_STRINGS.NIGECOIN_JWT, { path: '/' });
//   return c.json(new ApiResponse(200, { status: 'logged-out' }));
// }

export async function adminLogout(c: Context) {
  // 1) Delete the signed JWT cookie (mirrors how it was set)
  deleteCookie(c, COOKIE_STRINGS.NIGECOIN_JWT, COOKIE_OPTS);

  // 2) [Optional] Revoke the token server-side here, if you ever store sessions:
  //    await revokeSession(payload.accountId, payload.jti);

  // 3) Redirect back to your login page
  return c.redirect('/login', 302);
}

/**
 * Check endpoint
 */
export async function adminCheck(c: Context) {
  // 1) get from context
  const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
  const roles = c.get(CONTEXT_STATE.ROLES) as ROLE[];

  // 2) fetch account details
  const account = await AccountModel.findById(accountId).lean();
  if (!account) {
    return c.json(new ApiResponse(404, null, 'Account not found'), 404);
  }

  // 3) fetch twitter‐link(s)
  const twitterLinks = await AuthProviderModel.find({
    accountId,
    provider: 'twitter',
  })
    .select('providerUserId -_id')
    .lean();

  // 4) fetch user profile (username/avatar)
  const profile = await UserModel.findOne({ accountId }).select('username name avatarUrl -_id').lean();

  // 5) combine permissions from all roles
  const perms = roles.flatMap((r) => ROLE_PERMS[r] || []);
  const permissions = perms.includes('*') ? ['*'] : Array.from(new Set(perms));

  // 6) pick “currentRole” = highest privilege
  //    superAdmin > admin
  const currentRole = roles.includes(ROLES.SUPER_ADMIN) ? ROLES.SUPER_ADMIN : roles.includes(ROLES.ADMIN) ? ROLES.ADMIN : roles[0]; // fallback

  return c.json(
    new ApiResponse(200, {
      account: {
        _id: account._id.toString(),
        balance: account.balance,
        system: !!account.system,
      },
      profile: profile || null,
      twitterLinks: twitterLinks.map((t) => t.providerUserId),
      roles,
      currentRole,
      permissions,
    })
  );
}
