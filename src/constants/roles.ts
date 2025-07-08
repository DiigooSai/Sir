import { z } from 'zod';

/**
 * Central role catalogue – keep it single-source!
 */
export const ROLES = {
  /* ─────────── Ecosystem-level ─────────── */
  SUPER_ADMIN: 'ecosystem:superAdmin',
  ADMIN: 'ecosystem:admin',
  TREASURY: 'ecosystem:treasury',
  EXCHANGE: 'ecosystem:exchange',
  POOL: 'ecosystem:pool',

  /* ─────────── App-specific ─────────── */
  // nige earn
  NIGE_EARN_USER: 'nigeEarn:user',

  // nige link
  NIGE_LINK_FL: 'nigeLink:freelancer',
  NIGE_LINK_CT: 'nigeLink:contractor',
  NIGE_LINK_MD: 'nigeLink:moderator',

  // nige nest
  NIGE_NEST_USER: 'nigeNest:nestUser',
} as const;

export type ROLE = (typeof ROLES)[keyof typeof ROLES];

export const toMakeInternal = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.TREASURY, ROLES.EXCHANGE, ROLES.POOL, ROLES.NIGE_LINK_MD];

const InternalRoleMakable = [ROLES.ADMIN, ROLES.NIGE_LINK_MD] as const;
export const InternalRoleMakableEnum = z.enum(InternalRoleMakable);
