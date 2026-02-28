import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
