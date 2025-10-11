import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  private bmrMifflinStJeor(sex: 'male' | 'female' | 'other' | null | undefined, weightKg: number, heightCm: number, ageYears: number) {
    // Default to male/female equations; treat other as male
    const s = sex === 'female' ? -161 : 5;
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + s);
  }

  private activityMultiplier(level: ActivityLevel): number {
    switch (level) {
      case 'sedentary': return 1.2;
      case 'light': return 1.375;
      case 'moderate': return 1.55;
      case 'active': return 1.725;
      case 'very_active': return 1.9;
      default: return 1.55;
    }
  }

  async setGoal(userId: string, targetWeightKg: number, targetDateISO: string, activity: ActivityLevel) {
    if (!userId) throw new BadRequestException('user_required');
    const d = new Date(targetDateISO);
    if (Number.isNaN(+d)) throw new BadRequestException('date_invalid');
    const row = await (this.prisma as any).goal.upsert({
      where: { userId },
      update: { targetWeightKg, targetDate: d, activity: activity as any },
      create: { userId, targetWeightKg, targetDate: d, activity: activity as any },
    });
    return { id: row.id, targetWeightKg: row.targetWeightKg, targetDate: row.targetDate, activity: row.activity };
  }

  async getPlan(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new BadRequestException('not_found');
    const prof: any = (user as any).profile ?? {};

    const latestWeight = await (this.prisma as any).weightLog.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
    const currentWeightKg = latestWeight?.weightKg ?? null;
    const heightCm = prof?.heightCm ?? null;
    const ageYears = prof?.age ?? null;
    const sex = prof?.sex ?? null;

    const goal = await (this.prisma as any).goal.findUnique({ where: { userId } });

    const activity = (goal?.activity as ActivityLevel) || 'moderate';
    const multiplier = this.activityMultiplier(activity);

    let bmr = null as number | null;
    let tdee = null as number | null;
    if (currentWeightKg && heightCm && ageYears) {
      bmr = this.bmrMifflinStJeor(sex, currentWeightKg, heightCm, ageYears);
      tdee = Math.round(bmr * multiplier);
    }

    // default deficit 15% if goal is to lose weight
    let dailyCalories = tdee ? Math.round(tdee * 0.85) : null;

    return {
      profile: { sex, ageYears, heightCm, currentWeightKg },
      activity,
      bmr,
      tdee,
      dailyCalories,
      goal: goal ? { targetWeightKg: goal.targetWeightKg, targetDate: goal.targetDate } : null,
    };
  }
}


