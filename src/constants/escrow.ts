import { z } from 'zod';

const escrowZod = z
  .object({
    MAX_EGGS_MINT_LIMIT: z.number().int().positive(),
    MAX_EGGS_BURN_LIMIT: z.number().int().positive(),
  })
  .strict();

export const ESCROW = escrowZod.parse({
  MAX_EGGS_MINT_LIMIT: 100000,
  MAX_EGGS_BURN_LIMIT: 200000,
});
