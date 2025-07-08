import { Hono } from 'hono';
import { xAuth } from '@hono/oauth-providers/x';
import { requireAuth, startAuth } from '@/middlewares';
import { statusHandler, userLogout } from '@/controllers/auth/user.controller';
import { twitterCallback } from '@/controllers/auth';
import { walletAuthRoutes } from './wallet-auth';
import { 
  generateWalletLinkingNonce, 
  linkWalletToAccount, 
  getWalletStatus, 
  unlinkWallet 
} from '@/controllers/auth/wallet-linking.controller';

const CALLBACK_URL = `${process.env.SERVER_BASE_URL!}${process.env.OAUTH_CALLBACK_PATH!}`;

export const authRoutes = new Hono();

// 1️⃣ Kickoff: sets cookies and redirects into OAuth flow
authRoutes.get('/start/:app', startAuth, (c) => c.redirect('/auth/x'));

// 2️⃣ Twitter OAuth handler — now includes like.read & bookmark.read
authRoutes.use(
  '/x',
  xAuth({
    client_id: process.env.CLIENT_ID!,
    client_secret: process.env.CLIENT_SECRET!,
    scope: ['tweet.read', 'users.read', 'like.read', 'bookmark.read', 'offline.access'],
    fields: ['profile_image_url', 'url'],
    redirect_uri: CALLBACK_URL,
  })
);

// 3️⃣ Final callback: persist tokens + redirect back to your app
authRoutes.get('/x', twitterCallback);

// 4️⃣ Wallet authentication routes (standalone wallet login)
authRoutes.route('/wallet', walletAuthRoutes);

// 5️⃣ Wallet linking routes (for Twitter-authenticated users)
authRoutes.post('/link-wallet/nonce', requireAuth, generateWalletLinkingNonce);
authRoutes.post('/link-wallet/connect', requireAuth, linkWalletToAccount);
authRoutes.get('/link-wallet/status', requireAuth, getWalletStatus);
authRoutes.delete('/link-wallet/disconnect', requireAuth, unlinkWallet);

// Status endpoint for debugging
authRoutes.get('/status', requireAuth, statusHandler);

authRoutes.post('/logout', requireAuth, userLogout);
