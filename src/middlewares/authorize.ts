import { CONTEXT_STATE } from '@/constants/hono-context';
import { ROLE_PERMS, type Permission } from '@/constants/permissions';
import type { Context, Next } from 'hono';

export function authorize(...required: Permission[]) {
  return async (c: Context, next: Next) => {
    const roles = (c.get(CONTEXT_STATE.ROLES) as string[]) || [];
    const ok = roles.some((r) => {
      if (!(r in ROLE_PERMS)) return false;
      const perms = ROLE_PERMS[r as keyof typeof ROLE_PERMS];
      return perms.includes('*') || required.every((p) => perms.includes(p));
    });

    if (!ok) return c.json({ message: 'Forbidden' }, 403);
    await next();
  };
}
