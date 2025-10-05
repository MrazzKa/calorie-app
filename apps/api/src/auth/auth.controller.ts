import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PrismaService } from '../prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { JwtService } from '../jwt/jwt.service';
import { RateLimitService } from '../common/rate-limit.service';
import type Redis from 'ioredis';
import * as crypto from 'node:crypto';
import { hash, randomId } from '../common/crypto.util';

const MAGIC_TTL_SEC = 15 * 60;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
    private readonly rateLimitService: RateLimitService,
    @Inject('REDIS') private readonly redis: Redis,
    @Inject(forwardRef(() => AuthService)) private readonly auth: AuthService,
  ) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.CREATED)
  async requestOtp(@Body() body: { email: string }, @Req() req: Request) {
    const email = body?.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email_required');

    const correlationId = (req as any).correlationId;
    const ip = req.ip || 'unknown';

    // Rate limiting
    await this.rateLimitService.rateLimit(
      `rl:otp:${email}`,
      this.cfg.get<number>('RL_OTP_PER_15M') || 5,
      15 * 60, // 15 minutes
      correlationId,
    );

    await this.rateLimitService.rateLimit(
      `rl:otp:ip:${ip}`,
      this.cfg.get<number>('RL_OTP_PER_HOUR_IP') || 20,
      60 * 60, // 1 hour
      correlationId,
    );

    await this.prisma.user.upsert({ where: { email }, create: { email }, update: {} });

    const { code } = await this.otp.issueForEmail(email);
    try {
      await this.otp.notifyByEmail(email, code);
      if ((this.auth as any).afterRequestOtp) await (this.auth as any).afterRequestOtp(email);
    } catch (e) {
      if (this.cfg.get('AUTH_DEV_IGNORE_MAIL_ERRORS') !== 'true') throw e;
    }
    return { ok: true };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.CREATED)
  async verifyOtp(
    @Body() body: { email: string; code: string; deviceId?: string },
    @Req() req: Request,
  ) {
    const email = body?.email?.trim().toLowerCase();
    const code = body?.code?.trim();
    if (!email || !code) throw new BadRequestException('email_code_required');

    const key = `otp:email:${email}:code`;
    const expected = await this.redis.get(key);
    if (!expected || expected !== code) throw new BadRequestException('invalid_code');
    await this.redis.del(key);

    const user = await this.prisma.user.upsert({ where: { email }, create: { email }, update: {} });

    const deviceId = body?.deviceId || 'e2e';
    const ua = (req.headers['user-agent'] as string) ?? '';
    const ip = req.ip;

    const { jti, refreshRaw } = await this.sessions.createOrRotate({
      userId: user.id,
      role: user.role,
      deviceId,
      ip,
      ua,
      redis: this.redis,
    });

    const access = await (this.jwt as any).signAccess?.({ sub: user.id, role: user.role, jti });
    if (!access) throw new Error('signAccess_unavailable');

    return { access, refresh: refreshRaw, jti };
  }

  @Post('request-magic')
  @HttpCode(HttpStatus.CREATED)
  async requestMagic(@Body() body: { email: string }, @Req() req: Request) {
    const email = body?.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email_required');

    const correlationId = (req as any).correlationId;
    const ip = req.ip || 'unknown';

    // Rate limiting
    await this.rateLimitService.rateLimit(
      `rl:magic:${email}`,
      this.cfg.get<number>('RL_MAGIC_PER_15M') || 5,
      15 * 60, // 15 minutes
      correlationId,
    );

    await this.rateLimitService.rateLimit(
      `rl:magic:ip:${ip}`,
      this.cfg.get<number>('RL_MAGIC_PER_HOUR_IP') || 20,
      60 * 60, // 1 hour
      correlationId,
    );

    await this.prisma.user.upsert({ where: { email }, create: { email }, update: {} });

    const t = Buffer.from(crypto.randomBytes(32)).toString('base64url');
    await this.redis.setex(`magic:latest:${email}`, MAGIC_TTL_SEC, t);
    await this.redis.setex(`magic:t:${t}`, MAGIC_TTL_SEC, email);

    try {
      if ((this.auth as any).requestMagic) await (this.auth as any).requestMagic({ email });
    } catch (e) {
      if (this.cfg.get('AUTH_DEV_IGNORE_MAIL_ERRORS') !== 'true') throw e;
    }
    return { ok: true };
  }

  @Get('_debug/latest-magic')
  async debugLatestMagic(@Query('email') email: string) {
    if (!email) throw new BadRequestException('email_required');
    const norm = email.trim().toLowerCase();
    let t = await this.redis.get(`magic:latest:${norm}`);
    if (!t && (this.auth as any).debugLatestMagic) t = await (this.auth as any).debugLatestMagic(norm);
    return { t };
  }

  @Post('magic-exchange')
  @HttpCode(HttpStatus.CREATED)
  async magicExchange(@Body() body: { t: string; deviceId?: string }, @Req() req: Request) {
    const t = body?.t?.trim();
    if (!t) throw new BadRequestException('t_required');

    const email = await this.redis.get(`magic:t:${t}`);
    if (!email) throw new UnauthorizedException('invalid_or_expired');

    await this.redis.del(`magic:t:${t}`);
    await this.redis.del(`magic:latest:${email}`);

    const user = await this.prisma.user.upsert({ where: { email }, create: { email }, update: {} });

    const deviceId = body?.deviceId || 'e2e';
    const ua = (req.headers['user-agent'] as string) ?? '';
    const ip = req.ip;

    const { jti, refreshRaw } = await this.sessions.createOrRotate({
      userId: user.id,
      role: user.role,
      deviceId,
      ip,
      ua,
      redis: this.redis,
    });

    const access = await (this.jwt as any).signAccess?.({ sub: user.id, role: user.role, jti });
    if (!access) throw new Error('signAccess_unavailable');

    return { access, refresh: refreshRaw, jti };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.CREATED)
  async refresh(
    @Body() body: { refresh: string; jti: string; deviceId?: string },
    @Req() req: Request,
  ) {
    const refresh = body?.refresh;
    const jti = body?.jti;
    if (!refresh || !jti) throw new BadRequestException('refresh_jti_required');

    if ((this.auth as any).refresh) {
      try {
        return await (this.auth as any).refresh({
          refresh,
          jti,
          deviceId: body?.deviceId || 'e2e',
          ua: (req.headers['user-agent'] as string) ?? '',
          ip: req.ip,
        });
      } catch {
        // fallback ниже
      }
    }

    const rotated = await this.sessions.rotateByJti({ jti, redis: this.redis });
    const newRefresh = randomId(32);
    const newHash = await hash(newRefresh);

    await this.prisma.session.update({
      where: { jti: rotated.newJti },
      data: { refreshHash: newHash },
    });

    const access = await (this.jwt as any).signAccess?.({
      sub: rotated.userId,
      role: rotated.role,
      jti: rotated.newJti,
    });
    if (!access) throw new Error('signAccess_unavailable');

    return { access, refresh: newRefresh, jti: rotated.newJti };
  }

  @Post('logout')
  @HttpCode(HttpStatus.CREATED)
  async logout(
    @Headers('authorization') authz?: string,
    @Body() body?: { jti?: string },
  ) {
    if (body?.jti) {
      await this.sessions.revokeOne(body.jti, this.redis);
      return { ok: true };
    }

    if ((this.auth as any).logout) {
      const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
      await (this.auth as any).logout({ access: token });
      return { ok: true };
    }

    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.CREATED)
  async logoutAll(
    @Headers('authorization') authz?: string,
    @Body() body?: { userId?: string; jti?: string },
  ) {
    if ((this.auth as any).logoutAll) {
      try {
        const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
        await (this.auth as any).logoutAll({ access: token });
        return { ok: true };
      } catch {
        // fallback below
      }
    }

    if (body?.userId) {
      await this.sessions.revokeAll(body.userId, this.redis);
      return { ok: true };
    }

    if (body?.jti) {
      const sess = await this.prisma.session.findUnique({ where: { jti: body.jti } });
      if (sess) await this.sessions.revokeAll(sess.userId, this.redis);
      return { ok: true };
    }

    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (token) {
      let sub: string | undefined;

      if ((this.jwt as any).verifyAccess) {
        try {
          const payload = await (this.jwt as any).verifyAccess(token);
          sub = typeof payload?.sub === 'string' ? payload.sub : undefined;
        } catch {
          // fallback decode
        }
      }
      if (!sub) {
        try {
          const [, p2] = token.split('.');
          const json = Buffer.from(p2, 'base64url').toString('utf8');
          const payload = JSON.parse(json);
          sub = typeof payload?.sub === 'string' ? payload.sub : undefined;
        } catch {
          /* ignore */
        }
      }
      if (sub) {
        await this.sessions.revokeAll(sub, this.redis);
      }
    }

    return { ok: true };
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Headers('authorization') authz?: string,
    @Body() body?: { reason?: string },
  ) {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');

    let sub: string | undefined;
    if ((this.jwt as any).verifyAccess) {
      try {
        const payload = await (this.jwt as any).verifyAccess(token);
        sub = typeof payload?.sub === 'string' ? payload.sub : undefined;
      } catch {
        // fallback decode
      }
    }
    if (!sub) {
      try {
        const [, p2] = token.split('.');
        const json = Buffer.from(p2, 'base64url').toString('utf8');
        const payload = JSON.parse(json);
        sub = typeof payload?.sub === 'string' ? payload.sub : undefined;
      } catch {
        throw new BadRequestException('invalid_access');
      }
    }

    // Soft delete user
    await this.prisma.user.update({
      where: { id: sub },
      data: {
        deletedAt: new Date(),
        deletedReason: body?.reason || 'user_requested',
      },
    });

    // Revoke all sessions
    await this.sessions.revokeAll(sub, this.redis);
  }
}
