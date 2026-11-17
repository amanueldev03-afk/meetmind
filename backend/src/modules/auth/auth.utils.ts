import jwt from 'jsonwebtoken';

export function getJwtSecret(): string | undefined {
  return process.env.JWT_SECRET;
}

export function signAuthToken(userId: string, secret: string): string {
  return jwt.sign({}, secret, { subject: userId, expiresIn: '7d' });
}
