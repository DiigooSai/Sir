import type { Context } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import { adminLoginCallback } from './admin.controller';
import { userLoginCallback } from './user.controller';
import { COOKIE_STRINGS } from '@/constants/hono-context';

/**
 * 3️⃣  Callback handler: after Twitter has redirected back with code/state.
 */
export const twitterCallback = async (c: Context) => {
  const rawApp = await getSignedCookie(c, process.env.COOKIE_SECRET!, COOKIE_STRINGS.O_AUTH_APP);

  if (rawApp === 'nige-admin') {
    return adminLoginCallback(c);
  }

  return userLoginCallback(c);
};
