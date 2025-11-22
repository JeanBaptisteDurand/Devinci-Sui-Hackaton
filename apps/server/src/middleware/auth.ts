import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prismaClient';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 days

export interface AuthRequest extends Request {
  user?: {
    id: string;
    walletAddress: string;
    tier?: number;
  };
}

/**
 * Verify a wallet signature and generate JWT token
 * 
 * For now, we trust the wallet address provided by the frontend.
 * In production, you should add additional signature verification.
 */
export async function loginWithWallet(req: Request, res: Response) {
  try {
    const { walletAddress, message, signature } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ 
        error: 'Missing required field: walletAddress' 
      });
    }

    // TODO: Add proper signature verification
    // For now, we trust the wallet address from the frontend
    // In production, verify the signature using @mysten/sui crypto utilities

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { walletAddress },
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        walletAddress: user.walletAddress,
        tier: user.tier
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ 
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        tier: user.tier,
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
}

/**
 * Middleware to verify JWT token
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.userId,
      walletAddress: decoded.walletAddress,
      tier: decoded.tier,
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional authentication - doesn't fail if no token, but sets user if valid
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        id: decoded.userId,
        walletAddress: decoded.walletAddress,
        tier: decoded.tier,
      };
    } catch (error) {
      // Token invalid but don't fail the request
    }
  }
  
  next();
}

