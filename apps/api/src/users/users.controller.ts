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
  Patch,                    // ← добавлено
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtService } from '../jwt/jwt.service';
import { PrismaService } from '../prisma.service';
import type Redis from 'ioredis';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  private extractSubFromAuthz(authz?: string): string {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    if ((this.jwt as any).verifyAccess) {
      try {
        const payload = (this.jwt as any).verifyAccess(token);
        if (payload?.sub && typeof payload.sub === 'string') return payload.sub;
      } catch { /* fall back */ }
    }
    try {
      const [, p2] = token.split('.');
      const json = Buffer.from(p2, 'base64url').toString('utf8');
      const payload = JSON.parse(json);
      if (payload?.sub && typeof payload.sub === 'string') return payload.sub;
    } catch { /* ignore */ }
    throw new BadRequestException('invalid_access');
  }

  @Get('me')
  async me(@Headers('authorization') authz?: string) {
    const sub = this.extractSubFromAuthz(authz);
    const u = await this.prisma.user.findUnique({
      where: { id: sub },
      include: { profile: { include: { photo: true } } }, // ← было UserProfile
    });
    if (!u) throw new BadRequestException('not_found');

    const p: any = (u as any).profile ?? null;
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      deletedAt: u.deletedAt,
      profile: p
        ? {
            name: p.name ?? null,
            age: p.age ?? null,
            sex: p.sex ?? null,
            photoAssetId: p.photoId ?? null,
          }
        : null,
    };
  }

  @Patch('me')
  async patchMe(
    @Headers('authorization') authz?: string,
    @Body() body?: { name?: string; age?: number; sex?: 'male' | 'female' | 'other'; photoAssetId?: string },
  ) {
    const sub = this.extractSubFromAuthz(authz);
    const prof = await this.users.updateProfile(sub, {
      name: body?.name,
      age: body?.age,
      sex: body?.sex,
      photoAssetId: body?.photoAssetId,
    });
    return {
      ok: true,
      profile: {
        name: prof.name ?? null,
        age: prof.age ?? null,
        sex: prof.sex ?? null,
        photoAssetId: prof.photoId ?? null,
      },
    };
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(
    @Headers('authorization') authz?: string,
    @Body() body?: { reason?: string },
  ) {
    const sub = this.extractSubFromAuthz(authz);
    const u = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!u) return;
    await this.users.deleteAccount({ userId: sub, reason: body?.reason, redis: this.redis });
  }
}
