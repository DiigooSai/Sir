import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { AccountModel, UserModel } from '@/db/models';
import { ApiResponse } from '@/utils/ApiResponse';
import { generateJWT } from '@/services/auth/jwt.service';
import type { Context } from 'hono';
import crypto from 'crypto';

// In-memory nonce storage (in production, use Redis)
const nonceStore = new Map<string, { nonce: string; timestamp: number }>();

/**
 * Generate a nonce for wallet signature
 */
export const generateWalletNonce = async (c: Context) => {
  try {
    const { walletAddress, chainType } = await c.req.json();
    
    // Generate a unique nonce
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Store nonce with timestamp (expires in 5 minutes)
    nonceStore.set(walletAddress.toLowerCase(), {
      nonce,
      timestamp: Date.now()
    });
    
    // Clean up expired nonces
    cleanupExpiredNonces();
    
    const message = `Sign this message to login to Nige Ecosystem.\n\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;
    
    return c.json(new ApiResponse(200, { 
      nonce, 
      message,
      walletAddress: walletAddress.toLowerCase(),
      chainType 
    }, 'Nonce generated successfully'));
  } catch (error) {
    return c.json({ 
      error: 'Failed to generate nonce', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Verify wallet signature
 */
export const verifyWalletSignature = async (c: Context) => {
  try {
    const { walletAddress, signature, message, chainType, nonce } = await c.req.json();
    
    const isValid = await verifySignature({
      walletAddress: walletAddress.toLowerCase(),
      signature,
      message,
      chainType,
      nonce
    });
    
    return c.json(new ApiResponse(200, { 
      isValid,
      walletAddress: walletAddress.toLowerCase() 
    }, isValid ? 'Signature verified' : 'Invalid signature'));
  } catch (error) {
    return c.json({ 
      error: 'Signature verification failed', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Wallet login with signature verification
 */
export const walletLogin = async (c: Context) => {
  try {
    const { walletAddress, signature, message, chainType, nonce } = await c.req.json();
    
    // Verify signature
    const isValid = await verifySignature({
      walletAddress: walletAddress.toLowerCase(),
      signature,
      message,
      chainType,
      nonce
    });
    
    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }
    
    // Clean up used nonce
    nonceStore.delete(walletAddress.toLowerCase());
    
    // Find or create user account
    let account = await AccountModel.findOne({ 
      walletId: walletAddress.toLowerCase() 
    });
    
    if (!account) {
      // Create new account for first-time wallet login
      account = new AccountModel({
        walletId: walletAddress.toLowerCase(),
        balance: 0,
        system: false,
        isInternal: false
      });
      await account.save();
      
      // Create user profile
      const user = new UserModel({
        accountId: account._id,
        name: `User_${walletAddress.slice(0, 8)}`,
        // Add other default user fields as needed
      });
      await user.save();
    }
    
    // Generate JWT token
    const jwt = generateJWT({ accountId: account._id.toString() });
    
    return c.json(new ApiResponse(200, {
      jwt,
      account: {
        id: account._id,
        walletId: account.walletId,
        balance: account.balance
      },
      isNewUser: !account.createdAt || 
        (Date.now() - new Date(account.createdAt).getTime()) < 60000 // Less than 1 minute old
    }, 'Wallet login successful'));
    
  } catch (error) {
    return c.json({ 
      error: 'Wallet login failed', 
      message: (error as Error).message 
    }, 500);
  }
};

/**
 * Verify signature based on chain type
 */
async function verifySignature({
  walletAddress,
  signature,
  message,
  chainType,
  nonce
}: {
  walletAddress: string;
  signature: string;
  message: string;
  chainType: 'evm' | 'solana';
  nonce: string;
}) {
  // Check if nonce is valid and not expired
  const storedNonce = nonceStore.get(walletAddress.toLowerCase());
  if (!storedNonce || storedNonce.nonce !== nonce) {
    throw new Error('Invalid or expired nonce');
  }
  
  // Check if nonce is not older than 5 minutes
  if (Date.now() - storedNonce.timestamp > 5 * 60 * 1000) {
    nonceStore.delete(walletAddress.toLowerCase());
    throw new Error('Nonce expired');
  }
  
  try {
    if (chainType === 'evm') {
      // Verify EVM signature (MetaMask, WalletConnect, etc.)
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } else if (chainType === 'solana') {
      // Verify Solana signature (Phantom, Solflare, etc.)
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