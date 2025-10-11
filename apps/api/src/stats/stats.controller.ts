import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '../jwt/jwt.service';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async extractSubFromAuthz(authz?: string): Promise<string> {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    
    try {
      const payload = await this.jwt.verifyAccess(token);
      if (payload?.sub) return String(payload.sub);
    } catch (error) {
      throw new BadRequestException('invalid_access');
    }
    
    throw new BadRequestException('invalid_access');
  }

  @Get('daily')
  async daily(
    @Headers('authorization') authz?: string,
    @Query('date') date?: string,
  ) {
    const userId = await this.extractSubFromAuthz(authz);
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

  @Get('range')
  async range(
    @Headers('authorization') authz?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = await this.extractSubFromAuthz(authz);
    const fromD = new Date((from || new Date().toISOString().slice(0,10)) + 'T00:00:00.000Z');
    const toD = new Date((to || new Date().toISOString().slice(0,10)) + 'T23:59:59.999Z');
    if (Number.isNaN(+fromD) || Number.isNaN(+toD) || fromD > toD) throw new BadRequestException('range_invalid');

    const meals = await this.prisma.meal.findMany({
      where: { userId, createdAt: { gte: fromD, lte: toD }, status: { in: ['ready','processing','pending'] } as any },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take: 2000,
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

    const byDay: Record<string, { kcal:number; protein:number; fat:number; carbs:number }>= {};
    for (const m of meals) {
      const day = m.createdAt.toISOString().slice(0,10);
      byDay[day] ||= { kcal:0, protein:0, fat:0, carbs:0 } as any;
      for (const it of m.items) {
        if (it.kcal != null) byDay[day].kcal += it.kcal;
        if (it.protein != null) byDay[day].protein += it.protein;
        if (it.fat != null) byDay[day].fat += it.fat;
        if (it.carbs != null) byDay[day].carbs += it.carbs;
      }
    }

    const days = Object.keys(byDay).sort().map(d => ({ date: d, totals: byDay[d] }));

    return {
      from: fromD.toISOString().slice(0,10),
      to: toD.toISOString().slice(0,10),
      totals: { kcal, protein, fat, carbs },
      days,
    };
  }
}
