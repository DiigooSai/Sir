import { COOKIE_OPTS } from '@/configs/cookie-config';
import { DEFAULT_APP_ROLE, PERMITTED_APPS } from '@/constants/app-roles';
import { CONTEXT_STATE, COOKIE_STRINGS } from '@/constants/hono-context';
import { AccountRoleModel, TwitterTokenModel } from '@/db/models';
import { NEST_ACCOUNT_TYPES, NestAccountModel } from '@/db/models/nige-nest/nest-account';
import { upsertUserAndIssueJwt } from '@/services/auth/auth.service';
import {
  fetchCommonDetails,
  fetchEarnDetails,
  fetchLinkDetails,
  type CommonDetails,
  type EarnDetails,
  type LinkDetails,
} from '@/services/auth/user-status.service';
import type { RoleId } from '@/types';
import { ApiResponse } from '@/utils/ApiResponse';
import { runInTransaction } from '@/utils/transaction-helper';
import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

export async function userLoginCallback(c: Context) {
  // 1) Extract Twitter tokens & profile
  const twTokens = c.get(CONTEXT_STATE.TOKEN) as {
    token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const twProfile = c.get(CONTEXT_STATE.USER_X) as {
    id: string;
    username: string;
    name?: string;
    profile_image_url?: string;
  };

  console.log('🔐 Received Twitter OAuth tokens (user):', twTokens);

  // 2) All DB work in one transaction
  const { ourJwt } = await runInTransaction(async (session) => {
    // upsert user/account + issue JWT
    const { jwt: issuedJwt, account: acct } = await upsertUserAndIssueJwt(twProfile, twTokens, session);

    // persist Twitter tokens
    await TwitterTokenModel.findOneAndUpdate(
      { userId: acct._id },
      {
        accessToken: twTokens.token,
        refreshToken: twTokens.refresh_token!,
        expiresAt: new Date(Date.now() + twTokens.expires_in * 1000),
      },
      { upsert: true, new: true, session }
    );

    // assign default role
    const rawAppName = await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_APP);
    const loginAs = await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.LOGIN_AS);

    let defaultRole: string | undefined;
    if (rawAppName) {
      defaultRole = loginAs && DEFAULT_APP_ROLE[rawAppName].allowedSignups.includes(loginAs) ? loginAs : DEFAULT_APP_ROLE[rawAppName].default;
    }
    if (!defaultRole) {
      throw new ApiResponse(400, null, 'No default role configured for this application');
    }

    const alreadyHas = await AccountRoleModel.exists({ accountId: acct._id, roleId: defaultRole }, { session });
    if (!alreadyHas) {
      await AccountRoleModel.create([{ accountId: acct._id, roleId: defaultRole }], { session });
    }

    // nest‐specific logic
    if (rawAppName === PERMITTED_APPS.NIGE_NEST) {
      const nestAccount = await NestAccountModel.findOne({ accountId: acct._id }, null, { session });
      if (!nestAccount) {
        await NestAccountModel.create([{ accountId: acct._id, accountType: NEST_ACCOUNT_TYPES.USER, eggs: 0, gems: 0 }], { session });
      }
    }

    return { ourJwt: issuedJwt };
  });

  // 3) Cleanup cookies & set our JWT
  const returnTo = (await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_RETURN)) || '/';
  deleteCookie(c, COOKIE_STRINGS.O_AUTH_APP, COOKIE_OPTS);
  deleteCookie(c, COOKIE_STRINGS.O_AUTH_RETURN, COOKIE_OPTS);
  deleteCookie(c, COOKIE_STRINGS.LOGIN_AS, COOKIE_OPTS);

  await setSignedCookie(c, COOKIE_STRINGS.NIGECOIN_JWT, ourJwt, process.env.COOKIE_SECRET!, COOKIE_OPTS);

  // 4) Redirect
  return c.redirect(returnTo);
}

type DetailsResponse = CommonDetails & Partial<LinkDetails & EarnDetails>;

export async function statusHandler(c: Context) {
  const { accountId } = c.get(CONTEXT_STATE.JWT_PAYLOAD) as { accountId: string };
  const app = c.req.query('app') as string | undefined;

  // 1) always load common
  const common = await fetchCommonDetails(accountId);

  // 2) conditionally load app-specific
  const extra: Partial<LinkDetails & EarnDetails> = {};
  if (app === 'nige-link') {
    // get all the roles for this account
    const accountRoleRelations = await AccountRoleModel.find({ accountId }).lean();
    const roles = accountRoleRelations.map((ar) => ar.roleId as RoleId);
    const possibleRoles = DEFAULT_APP_ROLE[app].all.filter((av) => roles.includes(av));
    // make array of possible roles => intersection of roles and DEFAULT_APP_ROLE[app].all
    if (possibleRoles?.length < 1) {
      return c.json(new ApiResponse(403, null, 'Forbidden – insufficient role'), 403);
    }
    const linkDetails = await fetchLinkDetails(accountId);
    Object.assign(extra, { ...linkDetails, possibleRoles });
  } else if (app === 'nige-earn') {
    Object.assign(extra, fetchEarnDetails());
  }
  const details: DetailsResponse = { ...common, ...extra };
  return c.json(new ApiResponse(200, { user: details }));
}

export async function userLogout(c: Context) {
  // 1) remove our signed JWT
  deleteCookie(c, COOKIE_STRINGS.NIGECOIN_JWT, COOKIE_OPTS);

  // 2) redirect back to your front-end login or home
  return c.redirect('/login', 302);
}
