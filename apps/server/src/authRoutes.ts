import { Router } from 'express';
import { authenticateWallet } from './auth.js';
import { logger } from './logger.js';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user with wallet signature
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

export default router;

