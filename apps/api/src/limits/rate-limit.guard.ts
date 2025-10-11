import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Inject } from '@nestjs/common';
import type IORedis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DailyPhotoLimitGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const authz: string | undefined = req.headers['authorization'];
    const token = authz?.startsWith('Bearer ') ? authz.slice(7) : undefined;

    // Извлекаем userId безопасно (как в FoodController)
    let sub: string | undefined;
    try {
      const [, p2] = String(token).split('.');
      const json = Buffer.from(p2, 'base64url').toString('utf8');
      const payload = JSON.parse(json);
      sub = typeof payload?.sub === 'string' ? payload.sub : undefined;
    } catch {}

    if (!sub) throw new ForbiddenException('access_required');

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user) throw new ForbiddenException('user_not_found');
    if (user.role === 'pro') return true; // нет лимита

    const limit = Number(this.cfg.get('FREE_DAILY_PHOTO_LIMIT') ?? 5);
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `limit:photo:${sub}:${day}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      const ttl = 86400 - (Math.floor((Date.now() % 86400000) / 1000)); // до конца суток
      await this.redis.expire(key, Math.max(1, ttl));
    }

    if (count > limit) throw new ForbiddenException('daily_limit_exceeded');
    return true;
  }
}
