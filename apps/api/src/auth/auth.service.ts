import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type Redis from 'ioredis';
import { JwtService } from '../jwt/jwt.service';
import { MailerService } from '../mailer/mailer.service';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
  ) {}

  private redis!: Redis;
  
  setRedis(client: Redis) { 
    this.redis = client; 
  }

  private ttlLeft(expiresAt: Date) {
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }
  
  private hash(s: string) {
    return createHash('sha256').update(s).digest('hex');
  }
  
  private otpHash(s: string) {
    return createHash('sha256').update(s).digest('hex');
  }
  private async rateLimit(key: string, limit: number, windowSec: number) {
    const c = await this.redis.incr(key);
    if (c === 1) await this.redis.expire(key, windowSec);
    if (c > limit) throw new BadRequestException('Too many requests');
  }
  private async upsertUser(email: string) {
    return this.prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });
  }
  private async newSessionAndTokens(userId: string, role: string, deviceId: string, ua?: string, ip?: string) {
    const jti = this.jwt.genJti();
    const { token: refresh, exp } = await this.jwt.signRefresh({ sub: userId, role, jti });
    const access = await this.jwt.signAccess({ sub: userId, role, jti });

    await this.prisma.session.create({
      data: {
        userId,
        deviceId,
        jti,
        refreshHash: this.hash(refresh),
        userAgent: ua,
        ip,
        expiresAt: new Date(exp * 1000),
      },
    });

    return { access, refresh, jti };
  }

  async requestOtp(email: string, ip?: string) {
    await this.rateLimit(`otp:${email}:count:1m`, 5, 60);
    await this.rateLimit(`otp:${email}:count:1d`, 20, 86400);

    const code = (Math.floor(100000 + Math.random() * 900000)).toString();
    await this.redis.setex(`otp:email:${email}:hash`, 600, this.otpHash(code));
    await this.redis.del(`otp:fail:${email}`);

    const ignoreMail = String(process.env.AUTH_DEV_IGNORE_MAIL_ERRORS || 'false').toLowerCase() === 'true';
    try {
      await this.mailer.send(email, 'Your code', `<p>Your code: <b>${code}</b></p>`);
    } catch (e) {
      if (!ignoreMail) throw e;
    }
    return { ok: true };
  }

  async verifyOtp(email: string, code: string, deviceId: string, ua?: string, ip?: string) {
    const fails = parseInt((await this.redis.get(`otp:fail:${email}`)) || '0', 10);
    if (fails >= 7) throw new UnauthorizedException('Too many attempts');

    const saved = await this.redis.get(`otp:email:${email}:hash`);
    if (!saved || saved !== this.otpHash(code)) {
      await this.redis.incr(`otp:fail:${email}`);
      await this.redis.expire(`otp:fail:${email}`, 15 * 60);
      throw new UnauthorizedException('Invalid code');
    }

    await this.redis.del(`otp:email:${email}:hash`);
    await this.redis.del(`otp:fail:${email}`);
    const user = await this.upsertUser(email);

    return this.newSessionAndTokens(user.id, user.role, deviceId, ua, ip);
  }

  async requestMagic(email: string) {
    await this.rateLimit(`magic:${email}:count:1m`, 5, 60);
    await this.rateLimit(`magic:${email}:count:1d`, 20, 86400);

    const ttl = +(process.env.MAGIC_LINK_TTL_SEC || 600);
    const opaque = randomBytes(24).toString('base64url');
    const h = this.hash(opaque);

    await this.redis.setex(`magic:${h}`, ttl, email);
    await this.redis.setex(`magic:latest:${email.toLowerCase()}`, ttl, opaque);
    const appLinkDomain = process.env.APP_LINK_DOMAIN || process.env.APP_URL || 'http://localhost:3000';
    const url = `${appLinkDomain}/v1/auth/magic-exchange?t=${opaque}`;

    const ignoreMail = String(process.env.AUTH_DEV_IGNORE_MAIL_ERRORS || 'false').toLowerCase() === 'true';
    try {
      await this.mailer.sendMagic(email, url);
    } catch (e) {
      if (!ignoreMail) throw e;
    }
    return { ok: true };
  }

  async debugLatestMagic(emailRaw: string) {
    const email = (emailRaw || '').trim().toLowerCase();
    const t = await this.redis.get(`magic:latest:${email}`);
    if (!t) throw new BadRequestException('not_found');
    return { t };
  }

  async magicExchange(t: string, deviceId: string, ua?: string, ip?: string) {
    const h = this.hash(t);
    const email = await this.redis.get(`magic:${h}`);
    if (!email) throw new UnauthorizedException('Token expired/used');
    await this.redis.del(`magic:${h}`);

    const user = await this.upsertUser(email);
    return this.newSessionAndTokens(user.id, user.role, deviceId, ua, ip);
  }

  // ===== Refresh rotation =====
  async refresh(refresh: string, jti: string, ua?: string, ip?: string) {
    const payload = await this.jwt.verifyRefresh(refresh);
    if (payload.jti !== jti) throw new UnauthorizedException('jti mismatch');

    const black = await this.redis.get(`rf:blacklist:${jti}`);
    if (black) throw new UnauthorizedException('refresh revoked');

    const sess = await this.prisma.session.findUnique({ where: { jti } });
    if (!sess) throw new UnauthorizedException('session not found');
    if (sess.refreshHash !== this.hash(refresh)) throw new UnauthorizedException('refresh mismatch');

    const oldTtl = this.ttlLeft(sess.expiresAt);

    const userId = payload.sub;
    const role = payload.role;

    const newJti = this.jwt.genJti();
    const { token: newRefresh } = await this.jwt.signRefresh({ sub: userId, role, jti: newJti });
    const newAccess = await this.jwt.signAccess({ sub: userId, role, jti: newJti });

    await this.prisma.session.update({
      where: { jti },
      data: { jti: newJti, refreshHash: this.hash(newRefresh), userAgent: ua, ip },
    });

    if (oldTtl > 0) await this.redis.setex(`rf:blacklist:${jti}`, oldTtl, '1');

    return { access: newAccess, refresh: newRefresh, jti: newJti };
  }

  // ===== Logout =====
  async logout(jti: string) {
    const s = await this.prisma.session.findUnique({ where: { jti } });
    if (!s) return { ok: true };

    await this.prisma.session.update({ where: { jti }, data: { closedAt: new Date() } });
    const ttl = this.ttlLeft(s.expiresAt);
    if (ttl > 0) await this.redis.setex(`rf:blacklist:${jti}`, ttl, '1');

    return { ok: true };
  }

  async logoutAll(userId: string) {
    const sessions = await this.prisma.session.findMany({ where: { userId, closedAt: null } });
    for (const s of sessions) {
      await this.prisma.session.update({ where: { id: s.id }, data: { closedAt: new Date() } });
      const ttl = this.ttlLeft(s.expiresAt);
      if (ttl > 0) await this.redis.setex(`rf:blacklist:${s.jti}`, ttl, '1');
    }
    return { ok: true };
  }
}
