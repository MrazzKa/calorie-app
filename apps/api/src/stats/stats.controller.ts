import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '../jwt/jwt.service';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private extractSubFromAuthz(authz?: string): string {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    try {
      if ((this.jwt as any).verifyAccess) {
        const p = (this.jwt as any).verifyAccess(token);
        if (p?.sub) return p.sub as string;
      }
    } catch {}
    try {
      const [, p2] = token.split('.');
      const json = Buffer.from(p2, 'base64url').toString('utf8');
      const payload = JSON.parse(json);
      if (payload?.sub && typeof payload.sub === 'string') return payload.sub;
    } catch {}
    throw new BadRequestException('invalid_access');
  }

  @Get('daily')
  async daily(
    @Headers('authorization') authz?: string,
    @Query('date') date?: string, // YYYY-MM-DD (локаль не используется)
  ) {
    const userId = this.extractSubFromAuthz(authz);
    const d = date ? new Date(date + 'T00:00:00.000Z') : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    if (Number.isNaN(+d)) throw new BadRequestException('date_invalid');
    const start = d;
    const end = new Date(start.getTime() + 24 * 3600 * 1000);

    const meals = await this.prisma.meal.findMany({
      where: { userId, createdAt: { gte: start, lt: end }, status: { in: ['ready', 'processing', 'pending'] } as any },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let kcal = 0, protein = 0, fat = 0, carbs = 0;
    for (const m of meals) {
      for (const it of m.items) {
        if (it.kcal != null) kcal += it.kcal;
        if (it.protein != null) protein += it.protein;
        if (it.fat != null) fat += it.fat;
        if (it.carbs != null) carbs += it.carbs;
      }
    }

    return {
      date: start.toISOString().slice(0, 10),
      totals: { kcal, protein, fat, carbs },
      meals: meals.map(m => ({ id: m.id, createdAt: m.createdAt, items: m.items.length })),
    };
  }
}
