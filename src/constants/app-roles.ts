import { z } from 'zod';
import { ROLES, type ROLE } from './roles';

/** Which role to grant the very first time a user logs in from a given app */
export const PERMITTED_APPS = {
  NIGE_EARN: 'nige-earn',
  NIGE_LINK: 'nige-link',
  NIGE_NEST: 'nige-nest',
} as const;

// zod enum of permitted apps
export const permittedAppEnum = z.enum([PERMITTED_APPS.NIGE_EARN, PERMITTED_APPS.NIGE_LINK, PERMITTED_APPS.NIGE_NEST]);

export type PermittedApp = z.infer<typeof permittedAppEnum>;

export const DEFAULT_APP_ROLE: Record<
  PermittedApp,
  {
    all: ROLE[];
    allowedSignups: ROLE[];
    default: ROLE;
  }
> = {
  [PERMITTED_APPS.NIGE_EARN]: { all: [ROLES.NIGE_EARN_USER], allowedSignups: [ROLES.NIGE_EARN_USER], default: ROLES.NIGE_EARN_USER },
  [PERMITTED_APPS.NIGE_LINK]: {
    all: [ROLES.NIGE_LINK_FL, ROLES.NIGE_LINK_CT, ROLES.NIGE_LINK_MD],
    allowedSignups: [ROLES.NIGE_LINK_FL, ROLES.NIGE_LINK_CT],
    default: ROLES.NIGE_LINK_FL,
  },
  [PERMITTED_APPS.NIGE_NEST]: { all: [ROLES.NIGE_NEST_USER], allowedSignups: [ROLES.NIGE_NEST_USER], default: ROLES.NIGE_NEST_USER },
} as const;
