import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hash, randomId } from '../common/crypto.util';
import type Redis from 'ioredis';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async createOrRotate(args: { userId: string; role: string; deviceId: string; ip?: string; ua?: string; redis: Redis }) {
    // помечаем предыдущую активную на этом устройстве как rotated и кидаем её jti в blacklist
    const prev = await this.prisma.session.findFirst({ where: { userId: args.userId, deviceId: args.deviceId, status: 'active' } });
    if (prev) {
      await this.prisma.session.update({ where: { id: prev.id }, data: { status: 'rotated', lastRotatedAt: new Date() } });
      const ttlSec = Math.max(1, Math.floor((+prev.expiresAt - Date.now()) / 1000));
      await args.redis.setex(`blacklist:${prev.jti}`, ttlSec, '1');
    }

    const jti = randomId();
    const refreshRaw = randomId(32);
    const refreshHash = await hash(refreshRaw);
    const expiresAt = new Date(Date.now() + (Number(process.env.REFRESH_TTL_DAYS ?? 30) * 86400000));

    await this.prisma.session.create({
      data: { userId: args.userId, deviceId: args.deviceId, jti, refreshHash, ip: args.ip, ua: args.ua, expiresAt, status: 'active' },
    });

    return { jti, refreshRaw };
  }

  async rotateByJti(args: { jti: string; redis: Redis }) {
    // Запрещённый/уже использованный refresh
    if (await args.redis.get(`blacklist:${args.jti}`)) throw new UnauthorizedException('revoked');

    const sess = await this.prisma.session.findUnique({ where: { jti: args.jti } });
    if (!sess || sess.status !== 'active' || +sess.expiresAt < Date.now()) {
      throw new UnauthorizedException('invalid');
    }

    const newJti = randomId();
    const ttlSec = Math.max(1, Math.floor((+sess.expiresAt - Date.now()) / 1000));
    // Старый jti — в blacklist до конца жизни refresh
    await args.redis.setex(`blacklist:${sess.jti}`, ttlSec, '1');

    await this.prisma.session.update({
      where: { id: sess.id },
      data: { jti: newJti, lastRotatedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: sess.userId } });
    return { userId: sess.userId, role: user.role, newJti };
  }

  async revokeOne(jti: string, redis: Redis) {
    const sess = await this.prisma.session.findUnique({ where: { jti } });
    if (!sess) return; // идемпотентность
    if (sess.status !== 'revoked') {
      await this.prisma.session.update({ where: { jti }, data: { status: 'revoked' } });
    }
    const ttlSec = Math.max(1, Math.floor((+sess.expiresAt - Date.now()) / 1000));
    await redis.setex(`blacklist:${jti}`, ttlSec, '1');
  }

  async revokeAll(userId: string, redis: Redis) {
    const list = await this.prisma.session.findMany({ where: { userId, status: 'active' } });
    for (const s of list) await this.revokeOne(s.jti, redis);
  }
}
