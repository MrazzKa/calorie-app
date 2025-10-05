import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type Redis from 'ioredis';
import { JwtService } from '../../jwt/jwt.service'; // ← ВАЖНО: ../../jwt/jwt.service

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) throw new UnauthorizedException('No token');
    const token = auth.substring('Bearer '.length);

    const p = await this.jwt.verifyAccess(token);
    const black = await this.redis.get(`rf:blacklist:${p.jti}`);
    if (black) throw new UnauthorizedException('revoked');

    req.user = { sub: p.sub, role: p.role, jti: p.jti };
    return true;
  }
}

export const CurrentUser = createParamDecorator((data, ctx: any) => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
