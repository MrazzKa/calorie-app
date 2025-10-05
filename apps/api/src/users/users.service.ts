import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type Redis from 'ioredis';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  // уже был
  async deleteAccount(args: { userId: string; reason?: string; redis: Redis }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: args.userId, status: 'active' },
        data: { status: 'revoked' },
      });
      const active = await tx.session.findMany({ where: { userId: args.userId } });
      const now = new Date();
      for (const s of active) {
        const ttlSec = Math.max(1, Math.floor((+s.expiresAt - +now) / 1000));
        await args.redis.setex(`blacklist:${s.jti}`, ttlSec, '1');
      }
      await tx.user.update({
        where: { id: args.userId },
        data: { deletedAt: new Date(), deletedReason: args.reason ?? 'user_request' },
      });
    });
  }

  // новый
  async updateProfile(userId: string, dto: { name?: string; age?: number; sex?: 'male' | 'female' | 'other'; photoAssetId?: string }) {
    if (dto.age != null && (dto.age < 1 || dto.age > 120)) throw new BadRequestException('age_out_of_range');

    if (dto.photoAssetId) {
      const asset = await this.prisma.mediaAsset.findUnique({ where: { id: dto.photoAssetId } });
      if (!asset || asset.ownerId !== userId) throw new BadRequestException('photo_asset_invalid');
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        name: dto.name ?? null,
        age: dto.age ?? null,
        sex: (dto.sex as any) ?? null,
        photoId: dto.photoAssetId ?? null,
      },
      update: {
        name: dto.name ?? undefined,
        age: dto.age ?? undefined,
        sex: (dto.sex as any) ?? undefined,
        photoId: dto.photoAssetId ?? undefined,
      },
      include: { photo: true },
    });

    return profile;
  }
}
