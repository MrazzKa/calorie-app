import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { JwtService } from '../../jwt/jwt.service'; // ← ВАЖНО: ../../jwt/jwt.service

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('access_required');
    }
    const token = auth.substring('Bearer '.length);

    const payload = await this.jwt.verifyAccess(token);
    
    const isBlacklisted = await this.redis.get(`blacklist:${payload.jti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('token_revoked');
    }

    req.user = { sub: payload.sub, role: payload.role, jti: payload.jti };
    return true;
  }
}

export const CurrentUser = createParamDecorator((data: string | undefined, ctx: any) => {
  const req = ctx.switchToHttp().getRequest();
  if (!data) return req.user;
  return req.user?.[data];
});
