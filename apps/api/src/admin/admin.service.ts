import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async updateUserRole(args: {
    userId: string;
    role: string;
    planExpiresAt?: Date | null;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: args.userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    // Validate role
    const validRoles = ['free', 'pro', 'admin'];
    if (!validRoles.includes(args.role)) {
      throw new ForbiddenException(`invalid_role: must be one of ${validRoles.join(', ')}`);
    }

    // Update user role and optionally planExpiresAt
    const updated = await this.prisma.user.update({
      where: { id: args.userId },
      data: {
        role: args.role,
        // Note: planExpiresAt field may not exist in schema, so we skip it for now
        // If you add it to User model, uncomment this:
        // planExpiresAt: args.planExpiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async listUsers(args: { take?: number; skip?: number }) {
    const take = Math.min(args.take ?? 50, 1000);
    const skip = args.skip ?? 0;

    const users = await this.prisma.user.findMany({
      take,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    const total = await this.prisma.user.count();

    return { users, total, take, skip };
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        deletedReason: true,
        profile: true,
        _count: {
          select: {
            meals: true,
            mediaAssets: true,
            sessions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    return user;
  }
}

