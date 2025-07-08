// src/types.ts
import type { Context as HonoCtx } from 'hono';
import { ROLES } from '@/constants/roles';

export type RoleId = (typeof ROLES)[keyof typeof ROLES];

export interface State {
  jwtPayload: { accountId: string };
  roles: RoleId[];
}

/**
 * Your application Context, carrying our typed State.
 */
export type AppContext = HonoCtx<{ State: State }>;
