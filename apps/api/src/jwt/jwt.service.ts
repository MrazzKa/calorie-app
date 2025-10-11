import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  JWTPayload,
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  importJWK,
  exportJWK,
  JWK,
  KeyLike,
  generateKeyPair,
} from 'jose';
import * as fs from 'node:fs';

type AccessPayload = { sub: string; role: string; jti: string };
type RefreshPayload = { sub: string; role: string; jti: string };

function b64ToUtf8(b64?: string) {
  if (!b64) return undefined;
  return Buffer.from(b64, 'base64').toString('utf8');
}
function readMaybeFile(pathOrData?: string) {
  if (!pathOrData) return undefined;
  return fs.existsSync(pathOrData) ? fs.readFileSync(pathOrData, 'utf8') : pathOrData;
}
function normalizePem(input?: string) {
  if (!input) return input;
  // поддержка \n в .env, обрезка мусора и случайных '=' в начале
  const s = input.replace(/\\n/g, '\n').replace(/^\s*=+/, '').trim();
  return s;
}

@Injectable()
export class JwtService {
  private alg = (process.env.JWT_ALG as 'EdDSA' | 'RS256') || 'EdDSA';
  private issuer = process.env.JWT_ISSUER || 'caloriecam';
  private kid = process.env.JWT_KEY_ID || 'main-k1';
  private accessTtl = +(process.env.JWT_ACCESS_TTL_SEC || 1800);
  private refreshTtl = +(process.env.JWT_REFRESH_TTL_SEC || 2592000);

  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private publicJwk!: any;

  async onModuleInit() {
    // Приоритет загрузки:
    // 1) *_FILE пути к PEM
    // 2) *_BASE64 PEM в base64
    // 3) чистый PEM/JWK строкой
    const privFromFile = readMaybeFile(process.env.JWT_PRIVATE_KEY_FILE);
    const pubFromFile  = readMaybeFile(process.env.JWT_PUBLIC_KEY_FILE);

    const privFromB64  = b64ToUtf8(process.env.JWT_PRIVATE_KEY_BASE64 || process.env.JWT_PRIVATE_PEM_BASE64);
    const pubFromB64   = b64ToUtf8(process.env.JWT_PUBLIC_KEY_BASE64);

    const privRaw = privFromFile ?? privFromB64 ?? process.env.JWT_PRIVATE_KEY ?? process.env.JWT_PRIVATE_PEM;
    const pubRaw  = pubFromFile  ?? pubFromB64  ?? process.env.JWT_PUBLIC_KEY;

    if (!privRaw || !pubRaw) {
      // note: generate ephemeral keys in non-production
      if (process.env.NODE_ENV !== 'production') {
        const { privateKey, publicKey } = await generateKeyPair(this.alg);
        this.privateKey = privateKey as KeyLike;
        this.publicKey = publicKey as KeyLike;
        this.publicJwk = await exportJWK(this.publicKey);
        this.publicJwk.kid = this.kid;
        this.publicJwk.alg = this.alg;
        this.publicJwk.use = 'sig';
        return;
      }
      throw new Error('JWT keys are not provided (set *_FILE or *_BASE64 or plain PEM variables)');
    }

    const privNorm = normalizePem(privRaw);
    const pubNorm  = normalizePem(pubRaw);

    // Поддержка JWK (если положат JSON)
    if (privNorm!.startsWith('{')) {
      this.privateKey = (await importJWK(JSON.parse(privNorm!) as JWK, this.alg)) as KeyLike;
    } else {
      this.privateKey = await importPKCS8(privNorm!, this.alg);
    }
    if (pubNorm!.startsWith('{')) {
      this.publicKey  = (await importJWK(JSON.parse(pubNorm!)  as JWK, this.alg))  as KeyLike;
    } else {
      // Требуется SPKI PEM с заголовками BEGIN/END PUBLIC KEY
      this.publicKey = await importSPKI(pubNorm!, this.alg);
    }

    this.publicJwk = await exportJWK(this.publicKey);
    this.publicJwk.kid = this.kid;
    this.publicJwk.alg = this.alg;
    this.publicJwk.use = 'sig';

    // Самопроверка: подпишем и провалидируем пробный токен
    const now = Math.floor(Date.now() / 1000);
    const probe = await new SignJWT({ sub: 'probe', jti: 'probe' })
      .setProtectedHeader({ alg: this.alg, kid: this.kid, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(this.privateKey);
    await jwtVerify(probe, this.publicKey, { issuer: this.issuer });
  }

  getJWKS() {
    return { keys: [this.publicJwk] };
  }

  async signAccess(payload: AccessPayload) {
    const now = Math.floor(Date.now() / 1000);
    return await new SignJWT(payload as JWTPayload)
      .setProtectedHeader({ alg: this.alg, kid: this.kid, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + this.accessTtl)
      .sign(this.privateKey);
  }

  async signRefresh(payload: RefreshPayload) {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT(payload as JWTPayload)
      .setProtectedHeader({ alg: this.alg, kid: this.kid, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + this.refreshTtl)
      .sign(this.privateKey);
    const exp = now + this.refreshTtl;
    return { token, exp };
  }

  async verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, this.publicKey, { issuer: this.issuer });
    return payload as JWTPayload & AccessPayload;
  }

  async verifyRefresh(token: string) {
    const { payload } = await jwtVerify(token, this.publicKey, { issuer: this.issuer });
    return payload as JWTPayload & RefreshPayload;
  }

  genJti() {
    return randomBytes(16).toString('hex');
  }
  
  hashMagicToken(t: string) {
    return createHash('sha256').update(t).digest('hex');
  }
}