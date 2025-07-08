import jwt from 'jsonwebtoken';

export interface JWTPayload {
  accountId: string;
}

/**
 * Generate JWT token for authenticated users
 */
export function generateJWT(payload: JWTPayload): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

/**
 * Verify and decode JWT token
 */
export function verifyJWT(token: string): JWTPayload {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
} 