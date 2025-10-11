import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class WeightsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, date: string, weightKg: number) {
    if (!userId) throw new BadRequestException('user_required');
    if (!date) throw new BadRequestException('date_required');
    if (typeof weightKg !== 'number' || Number.isNaN(weightKg)) {
      throw new BadRequestException('weight_invalid');
    }
    const d = new Date(date + 'T00:00:00.000Z');
    if (Number.isNaN(+d)) throw new BadRequestException('date_invalid');
    const row = await (this.prisma as any).weightLog.upsert({
      where: { userId_date: { userId, date: d } as any },
      update: { weightKg },
      create: { userId, date: d, weightKg },
    });
    return { id: row.id, date: row.date, weightKg: row.weightKg };
  }

  async list(userId: string, from?: string, to?: string, take = 180) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from + 'T00:00:00.000Z');
      if (to) where.date.lte = new Date(to + 'T00:00:00.000Z');
    }
    const rows = await (this.prisma as any).weightLog.findMany({
      where,
      orderBy: { date: 'desc' },
      take: Math.min(Math.max(take, 1), 365),
    });
    return rows.map(r => ({ id: r.id, date: r.date, weightKg: r.weightKg }));
  }

  async remove(userId: string, id: string) {
    const row = await (this.prisma as any).weightLog.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('not_found');
    await (this.prisma as any).weightLog.delete({ where: { id } });
    return { ok: true };
  }
}


