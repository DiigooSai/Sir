// src/constants/permissions.ts
import { ROLES } from './roles';

/**
 * Granular permissions that business-logic checks against.
 */
export const PERMISSIONS = {
  LEDGER_MINT: 'ledger.mint',
  LEDGER_BURN: 'ledger.burn',
  LEDGER_HISTORY: 'ledger.history',
  LEDGER_ADMIN_XFER: 'ledger.adminTransfer',
  NEST_MINT: 'nest.mint',
  NEST_BURN: 'nest.burn',
  NEST_FUND_EXCHANGE: 'nest.fundExchange',
  NEST_WITHDRAW_EXCHANGE: 'nest.withdrawExchange',
  USER_TRANSFER: 'ledger.userTransfer',
  REWARD_SETTINGS: 'rewardSettings',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role-to-permission mapping.
 * `'*'` means “everything”.
 */
export const ROLE_PERMS: Record<string, readonly string[]> = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: [PERMISSIONS.REWARD_SETTINGS],
  [ROLES.TREASURY]: [],
  [ROLES.NIGE_EARN_USER]: [],
};
