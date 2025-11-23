import { Router } from 'express';
import { authenticateWallet, verifyToken } from './auth.js';
import { authenticateZkLogin } from './zklogin.js';
import { logger } from './logger.js';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user with wallet signature (Slush)
 * Body: { walletAddress, message, signature }
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { walletAddress, message, signature } = req.body;

    if (!walletAddress || !message || !signature) {
      return res.status(400).json({
        error: 'Missing required fields: walletAddress, message, signature'
      });
    }

    // Check if user already has an active JWT from another provider
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload && payload.authProvider === 'zklogin') {
        return res.status(409).json({
          error: 'Already logged in with zkLogin. Please logout first.'
        });
      }
    }

    logger.info('auth', 'Login attempt', { walletAddress });

    const result = await authenticateWallet(walletAddress, message, signature);

    if (!result) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info('auth', 'Login successful', { userId: result.user.id, walletAddress });

    res.json({
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    logger.error('auth', 'Login error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || 'Authentication failed' });
  }
});

/**
 * POST /api/auth/zklogin
 * Authenticate user with zkLogin via Enoki
 * Body: { sessionToken, address }
 */
router.post('/auth/zklogin', async (req, res) => {
  try {
    const { sessionToken, address } = req.body;

    if (!sessionToken || !address) {
      return res.status(400).json({
        error: 'Missing required fields: sessionToken, address'
      });
    }

    // Check if user already has an active JWT from another provider
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload && payload.authProvider === 'slush') {
        return res.status(409).json({
          error: 'Already logged in with Slush wallet. Please logout first.'
        });
      }
    }

    logger.info('auth', 'zkLogin attempt', { address });

    const result = await authenticateZkLogin(sessionToken, address);

    if (!result) {
      return res.status(401).json({ error: 'Invalid zkLogin proof' });
    }

    logger.info('auth', 'zkLogin successful', { userId: result.user.id, address });

    res.json({
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    logger.error('auth', 'zkLogin error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || 'zkLogin authentication failed' });
  }
});

/**
 * GET /api/auth/zklogin/initiate
 * zkLogin OAuth flow - TEMPORARILY DISABLED
 * 
 * This requires proper Google OAuth setup and zkLogin implementation
 * For now, please use Slush wallet authentication
 */
router.get('/auth/zklogin/initiate', async (req, res) => {
  logger.warn('auth', 'zkLogin not fully implemented - redirecting to frontend');

  const redirectUrl = (req.query.redirect as string) || req.headers.referer || 'http://localhost:3000';

  // Return error message to frontend
  res.status(501).json({
    error: 'zkLogin not implemented',
    message: 'zkLogin authentication is not yet available. Please use Slush wallet instead.',
    redirectUrl
  });
});

/**
 * POST /api/auth/logout
 * Logout user (client-side should clear JWT)
 */
router.post('/auth/logout', async (req, res) => {
  try {
    // JWT is stateless, so logout is handled client-side
    // This endpoint exists for future extensions (e.g., token blacklisting)
    logger.info('auth', 'Logout request received');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    logger.error('auth', 'Logout error', { error: error.message });
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;

