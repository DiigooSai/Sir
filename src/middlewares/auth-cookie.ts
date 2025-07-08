import { createFactory } from 'hono/factory';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import type { Context, Next } from 'hono';
import { ROLES, type ROLE } from '@/constants/roles';
import { AccountRoleModel } from '@/db/models/account-role';
import { COOKIE_OPTS } from '@/configs/cookie-config';
import { CONTEXT_STATE, COOKIE_STRINGS } from '@/constants/hono-context';
import { ROLE_PERMS } from '@/constants';
import { NestAccountModel } from '@/db/models/nige-nest/nest-account';

type RoleCheck = {
  allowed: ROLE[];
  onFailRedirect?: boolean;
  callback?: (accountId: string) => Promise<void>;
};

const factory = createFactory();

/**
 * 1️⃣  Entry point: stores which “app” and where to return after login.
 */
export const startAuth = factory.createMiddleware(async (c: Context, next: Next) => {
  const appName = c.req.param('app');
  const returnTo = c.req.query('returnTo');
  const loginAs = c.req.query('loginAs');
  if (!appName || !returnTo) {
    throw new Error('Missing required parameters: app and returnTo');
  }
  await setSignedCookie(c, COOKIE_STRINGS.O_AUTH_APP, appName, process.env.COOKIE_SECRET!, COOKIE_OPTS);
  await setSignedCookie(c, COOKIE_STRINGS.O_AUTH_RETURN, returnTo, process.env.COOKIE_SECRET!, COOKIE_OPTS);
  await setSignedCookie(c, COOKIE_STRINGS.LOGIN_AS, loginAs ?? '', process.env.COOKIE_SECRET!, COOKIE_OPTS);
  await next();
});

/**
 * Middleware that ensures the user is authenticated,
 * loads their roles, and attaches them (with accountId) to context.
 */
export const requireAuth = factory.createMiddleware(async (c: Context, next: Next) => {
  const token = await extractToken(c);
  if (!token) return c.json({ message: 'Unauthenticated' }, 401);
  try {
    const { accountId } = await verifyPayload<{ accountId: string }>(token);
    c.set(CONTEXT_STATE.ACCOUNT_ID, accountId);
    c.set(CONTEXT_STATE.JWT_PAYLOAD, { accountId });

    const roles = await fetchRoles(accountId);
    c.set(CONTEXT_STATE.ROLES, roles);
    c.set(CONTEXT_STATE.PERMISSIONS, []);
    return next();
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401);
  }
});

// Specific middlewares
export const requireAdminAuth = createAuthMiddleware({
  allowed: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
});

export const requireSuperAdminAuth = createAuthMiddleware({
  allowed: [ROLES.SUPER_ADMIN],
});

export const requireContractorAuth = createAuthMiddleware({
  allowed: [ROLES.NIGE_LINK_CT],
});

export const requireEarnAuth = createAuthMiddleware({
  allowed: [ROLES.NIGE_EARN_USER],
  onFailRedirect: false,
});

export const requireNestUserAuth = createAuthMiddleware({
  allowed: [ROLES.NIGE_NEST_USER],
  onFailRedirect: false,
  callback: async (accountId) => {
    if (!accountId) {
      throw new Error('No Account Id');
    }
    const count = await NestAccountModel.countDocuments({ accountId }).exec();
    if (count === 0) {
      throw new Error(`No Nest Account found for Account Id: ${accountId}`);
    }
    if (count > 1) {
      throw new Error('More than one Nest Account: Invalid');
    }
  },
});

// UTILITIES

/**
 * Safely extract our JWT token from signed cookies.
 * Coerces false or undefined to null for consistent typing.
 */
export async function extractToken(c: Context): Promise<string | null> {
  const raw = await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.NIGECOIN_JWT);
  return typeof raw === 'string' && raw ? raw : null;
}

export async function verifyPayload(token: string): Promise<any> {
  return jwt.verify(token, process.env.JWT_SECRET!);
}

async function fetchRoles(accountId: string): Promise<ROLE[]> {
  const relations = await AccountRoleModel.find({ accountId }).lean();
  return relations.map((r) => r.roleId as ROLE);
}

async function attachContext(c: Context, accountId: string, role: ROLE): Promise<void> {
  c.set(CONTEXT_STATE.ACCOUNT_ID, accountId);
  c.set(CONTEXT_STATE.ROLES, [role]);
  c.set(CONTEXT_STATE.PERMISSIONS, ROLE_PERMS[role]);
  c.set(CONTEXT_STATE.JWT_PAYLOAD, { accountId });
}

/**
 * Factory to create auth middleware requiring specific roles.
 * Ensures SUPER_ADMIN always takes precedence over ADMIN.
 */
export function createAuthMiddleware({ allowed, onFailRedirect = true, callback }: RoleCheck) {
  return factory.createMiddleware(async (c: Context, next: Next) => {
    // 1) Extract & verify token
    const token = await extractToken(c);
    if (!token) {
      return onFailRedirect
        ? c.redirect((await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_RETURN)) || '/')
        : c.json({ message: 'Not authenticated' }, 401);
    }

    let payload: any;
    try {
      payload = await verifyPayload(token);
    } catch {
      return onFailRedirect
        ? c.redirect((await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_RETURN)) || '/')
        : c.json({ message: 'Invalid or expired token' }, 401);
    }

    // 2) Load user roles
    const { accountId } = payload as { accountId: string };
    const roles = await fetchRoles(accountId);

    // 3) SUPER_ADMIN always bypasses
    if (roles.includes(ROLES.SUPER_ADMIN)) {
      await attachContext(c, accountId, ROLES.SUPER_ADMIN);
      return next();
    }

    // 4) Otherwise, match one of the allowed roles
    const matchedRole = allowed.find((r) => roles.includes(r));
    if (!matchedRole) {
      return onFailRedirect
        ? c.redirect((await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_RETURN)) || '/')
        : c.json({ message: 'Forbidden' }, 403);
    }

    await callback?.(accountId);

    // 5) Attach context and continue
    await attachContext(c, accountId, matchedRole);
    await next();
  });
}
