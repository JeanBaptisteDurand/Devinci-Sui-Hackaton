import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import prisma from './prismaClient.js';
import { logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
// JWT expires when wallet disconnects - no fixed expiration, but invalidated on wallet disconnect
// Using a long expiration (1 year) since wallet connection controls the actual session
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '365d';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    walletAddress: string;
    authProvider: 'slush' | 'zklogin';
  };
}

export interface JWTPayload {
  userId: string;
  walletAddress: string;
  authProvider: 'slush' | 'zklogin';
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: string, walletAddress: string, authProvider: 'slush' | 'zklogin' = 'slush'): string {
  return jwt.sign(
    { userId, walletAddress, authProvider },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Authenticate user with wallet signature (Slush)
 */
export async function authenticateWallet(
  walletAddress: string,
  message: string,
  signature: string
): Promise<{ token: string; user: { id: string; walletAddress: string; authProvider: string } } | null> {
  try {
    // Convert message to bytes
    const messageBytes = new Uint8Array(Buffer.from(message, 'utf-8'));
    
    // Verify the signature
    // signature from dapp-kit is a base64 string that needs to be converted
    let isValid = false;
    try {
      // Try with signature as-is (might be base64 string)
      isValid = await verifyPersonalMessageSignature(
        messageBytes,
        signature,
        walletAddress
      );
    } catch (verifyError: any) {
      logger.debug('auth', 'First verification attempt failed, trying alternative format', { 
        error: verifyError.message 
      });
      // If that fails, try converting from base64
      try {
        const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
        isValid = await verifyPersonalMessageSignature(
          messageBytes,
          signatureBytes,
          walletAddress
        );
      } catch (e: any) {
        logger.error('auth', 'Signature verification failed', { 
          error: e.message,
          walletAddress 
        });
        return null;
      }
    }

    if (!isValid) {
      logger.warn('auth', 'Invalid signature', { walletAddress });
      return null;
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { authAccounts: true }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { 
          walletAddress,
          authAccounts: {
            create: {
              authProvider: 'slush',
              suiAddress: walletAddress
            }
          }
        },
        include: { authAccounts: true }
      });
      logger.info('auth', 'New user created', { userId: user.id, walletAddress });
    } else {
      // Check if slush auth account exists
      const slushAccount = user.authAccounts.find(acc => acc.authProvider === 'slush');
      if (!slushAccount) {
        await prisma.userAuthAccount.create({
          data: {
            userId: user.id,
            authProvider: 'slush',
            suiAddress: walletAddress
          }
        });
      }
    }

    // Generate JWT token
    const token = generateToken(user.id, walletAddress, 'slush');

    return {
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        authProvider: 'slush'
      },
    };
  } catch (error: any) {
    logger.error('auth', 'Authentication error', { error: error.message, walletAddress });
    return null;
  }
}

/**
 * Middleware to verify JWT token
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    id: payload.userId,
    walletAddress: payload.walletAddress,
    authProvider: payload.authProvider,
  };

  next();
}

/**
 * Optional auth middleware - sets user if token is valid, but doesn't require it
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (payload) {
      req.user = {
        id: payload.userId,
        walletAddress: payload.walletAddress,
        authProvider: payload.authProvider,
      };
    }
  }

  next();
}

/**
 * Generate a unique slug for an analysis
 */
export function generateSlug(packageId: string, userId: string): string {
  const timestamp = Date.now().toString(36);
  const packageShort = packageId.slice(0, 8);
  const userShort = userId.slice(0, 8);
  return `${packageShort}-${userShort}-${timestamp}`;
}

