import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';

const KEY_LENGTH = 64;
const N = 16_384;
const R = 8;
const P = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { ...options, maxmem: MAX_MEMORY }, (error, key) => error ? reject(error) : resolve(key));
  });
}

function encode(salt: Buffer, hash: Buffer): string {
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

const dummySalt = Buffer.from('widgetflow-enumeration-salt');
export const DUMMY_PASSWORD_HASH = encode(dummySalt, scryptSync('not-a-real-password', dummySalt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY }));

export const passwordService = {
  validatePasswordPolicy(password: unknown): string {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128 || password.trim().length === 0) {
      throw new AppError('Password must be between 12 and 128 characters.', 400, 'PASSWORD_POLICY_FAILED');
    }
    return password;
  },
  async hashPassword(password: unknown): Promise<string> {
    const valid = this.validatePasswordPolicy(password);
    const salt = randomBytes(16);
    const derived = await derive(valid, salt, KEY_LENGTH, { N, r: R, p: P });
    return encode(salt, derived);
  },
  async verifyPassword(password: string, encoded: string): Promise<boolean> {
    try {
      const [algorithm, n, r, p, saltText, hashText] = encoded.split('$');
      if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
      const expected = Buffer.from(hashText, 'base64url');
      const actual = await derive(password, Buffer.from(saltText, 'base64url'), expected.length,
        { N: Number(n), r: Number(r), p: Number(p) });
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch { return false; }
  },
};
