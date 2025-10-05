import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

export const genOtp = () => (Math.floor(100000 + Math.random() * 900000)).toString();
export const hash = (s: string) => argon2.hash(s, { type: argon2.argon2id });
export const verify = (h: string, s: string) => argon2.verify(h, s);
export const randomId = (len = 16) => randomBytes(len).toString('hex');
