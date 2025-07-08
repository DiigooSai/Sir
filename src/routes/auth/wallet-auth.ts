import { Hono } from 'hono';
import { z } from 'zod';
import { zJsonValidator } from '@/utils/zValidators';
import { 
  generateWalletNonce,
  verifyWalletSignature,
  walletLogin 
} from '@/controllers/auth/wallet-auth.controller';

export const walletAuthRoutes = new Hono();

// Schema for wallet nonce generation
const walletNonceSchema = z.object({
  walletAddress: z.string().min(1),
  chainType: z.enum(['evm', 'solana'])
});

// Schema for wallet login
const walletLoginSchema = z.object({
  walletAddress: z.string().min(1),
  signature: z.string().min(1),
  message: z.string().min(1),
  chainType: z.enum(['evm', 'solana']),
  nonce: z.string().min(1)
});

// Generate nonce for wallet signature
walletAuthRoutes.post(
  '/wallet/nonce',
  zJsonValidator(walletNonceSchema),
  generateWalletNonce
);

// Verify wallet signature and login
walletAuthRoutes.post(
  '/wallet/login',
  zJsonValidator(walletLoginSchema),
  walletLogin
);

// Verify signature endpoint (for debugging)
walletAuthRoutes.post(
  '/wallet/verify',
  zJsonValidator(walletLoginSchema),
  verifyWalletSignature
); 