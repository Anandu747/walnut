import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export type Auth = { userId: string; tenantId: string; role: Role };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth: Auth;
    }
  }
}

// Reads the JWT and attaches { userId, tenantId, role }. tenantId ALWAYS comes from the token, never from the request body.
export function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET!) as Auth;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.auth.role === 'SUPER_ADMIN' || roles.includes(req.auth.role)) next();
    else res.status(403).json({ error: 'Forbidden' });
  };