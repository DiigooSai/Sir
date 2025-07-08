import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { UserModel } from '@/db/models';
import { ApiResponse } from '@/utils/ApiResponse';
import { CONTEXT_STATE } from '@/constants/hono-context';
import type { Context } from 'hono';
import crypto from 'crypto';

// In-memory nonce storage (in production, use Redis)
const nonceStore = new Map<string, { nonce: string; timestamp: number; accountId: string }>();

/**
 * Generate nonce for wallet linking (requires Twitter authentication)
 */
export const generateWalletLinkingNonce = async (c: Context) => {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Twitter authentication required first' }, 401);
    }

    const { walletAddress, chainType } = await c.req.json();
    
    // Check if wallet is already linked to another account
    const existingUser = await UserModel.findOne({ 
      walletAddress: walletAddress.toLowerCase(),
      accountId: { $ne: accountId }
    });
    
    if (existingUser) {
      return c.json({ 
        error: 'Wallet already linked to another account' 
      }, 400);
    }
    
    // Generate nonce
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Store nonce with account ID
    nonceStore.set(walletAddress.toLowerCase(), {
      nonce,
      timestamp: Date.now(),
      accountId
    });
    
    // Clean up expired nonces
    cleanupExpiredNonces();
    
    const message = `Link this wallet to your Nige Ecosystem account.\n\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}\nAccount: ${accountId}`;
    
    return c.json(new ApiResponse(200, { 
      nonce, 
      message,
      walletAddress: walletAddress.toLowerCase(),
      chainType 
    }, 'Wallet linking nonce generated'));
  } catch (error) {
    return c.json({ 
      error: 'Failed to generate wallet linking nonce', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Link wallet to Twitter-authenticated account
 */
export const linkWalletToAccount = async (c: Context) => {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Twitter authentication required first' }, 401);
    }

    const { walletAddress, signature, message, chainType, nonce } = await c.req.json();
    
    // Verify signature
    const isValid = await verifyWalletSignature({
      walletAddress: walletAddress.toLowerCase(),
      signature,
      message,
      chainType,
      nonce,
      expectedAccountId: accountId
    });
    
    if (!isValid) {
      return c.json({ error: 'Invalid wallet signature' }, 401);
    }
    
    // Clean up used nonce
    nonceStore.delete(walletAddress.toLowerCase());
    
    // Update user record with wallet information
    const user = await UserModel.findOneAndUpdate(
      { accountId },
      {
        walletAddress: walletAddress.toLowerCase(),
        walletType: chainType,
        walletConnectedAt: new Date(),
        isWalletVerified: true
      },
      { new: true }
    );
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json(new ApiResponse(200, {
      walletAddress: user.walletAddress,
      walletType: user.walletType,
      connectedAt: user.walletConnectedAt,
      user: {
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl
      }
    }, 'Wallet linked successfully'));
    
  } catch (error) {
    return c.json({ 
      error: 'Failed to link wallet', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Get wallet connection status for authenticated user
 */
export const getWalletStatus = async (c: Context) => {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const user = await UserModel.findOne({ accountId });
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    const walletConnected = !!(user.walletAddress && user.isWalletVerified);

    return c.json(new ApiResponse(200, {
      walletConnected,
      walletAddress: user.walletAddress,
      walletType: user.walletType,
      connectedAt: user.walletConnectedAt,
      user: {
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl
      }
    }, 'Wallet status retrieved'));
  } catch (error) {
    return c.json({ 
      error: 'Failed to get wallet status', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Unlink wallet from account
 */
export const unlinkWallet = async (c: Context) => {
  try {
    const accountId = c.get(CONTEXT_STATE.ACCOUNT_ID) as string;
    if (!accountId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const user = await UserModel.findOneAndUpdate(
      { accountId },
      {
        walletAddress: null,
        walletType: null,
        walletConnectedAt: null,
        isWalletVerified: false
      },
      { new: true }
    );

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(new ApiResponse(200, {
      message: 'Wallet unlinked successfully'
    }, 'Wallet unlinked'));
  } catch (error) {
    return c.json({ 
      error: 'Failed to unlink wallet', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Verify wallet signature for linking
 */
async function verifyWalletSignature({
  walletAddress,
  signature,
  message,
  chainType,
  nonce,
  expectedAccountId
}: {
  walletAddress: string;
  signature: string;
  message: string;
  chainType: 'evm' | 'solana';
  nonce: string;
  expectedAccountId: string;
}) {
  // Check if nonce is valid and not expired
  const storedNonce = nonceStore.get(walletAddress.toLowerCase());
  if (!storedNonce || storedNonce.nonce !== nonce) {
    throw new Error('Invalid or expired nonce');
  }
  
  // Verify account ID matches
  if (storedNonce.accountId !== expectedAccountId) {
    throw new Error('Account ID mismatch');
  }
  
  // Check if nonce is not older than 5 minutes
  if (Date.now() - storedNonce.timestamp > 5 * 60 * 1000) {
    nonceStore.delete(walletAddress.toLowerCase());
    throw new Error('Nonce expired');
  }
  
  try {
    if (chainType === 'evm') {
      // Verify EVM signature
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } else if (chainType === 'solana') {
      // Verify Solana signature
      const publicKey = new PublicKey(walletAddress);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, 'base64');
      
      return nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes()
      );
    }
    
    return false;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Clean up expired nonces (older than 5 minutes)
 */
function cleanupExpiredNonces() {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  for (const [address, data] of nonceStore.entries()) {
    if (now - data.timestamp > fiveMinutes) {
      nonceStore.delete(address);
    }
  }
} 