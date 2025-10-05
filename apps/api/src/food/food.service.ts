import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type IORedis from 'ioredis';
import { PrismaService } from '../prisma.service';
import { ANALYZER } from './tokens';
import type { IAnalyzerProvider, AnalyzeResultItem } from './providers/analyzer.interface';
import { UsdaService } from './usda/usda.service';

@Injectable()
export class FoodService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS') private readonly redis: IORedis,
    @Inject(ANALYZER) private readonly analyzer: IAnalyzerProvider,
    private readonly usda: UsdaService,
  ) {}

  private genS3Key(filename?: string) {
    const base = crypto.randomUUID().replace(/-/g, '');
    if (filename && filename.includes('.')) {
      const ext = filename.split('.').pop()!;
      return `local/${base}.${ext}`;
    }
    return `local/${base}.bin`;
  }

  private sha256(buf: Buffer) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  private async cacheGet(hash: string) {
    const raw = await this.redis.get(`analyze:${hash}`);
    return raw ? (JSON.parse(raw) as AnalyzeResultItem[]) : null;
  }

  private async cacheSet(hash: string, data: AnalyzeResultItem[]) {
    await this.redis.setex(`analyze:${hash}`, 7 * 86400, JSON.stringify(data));
  }

  async createPendingMeal(args: { userId: string }) {
    return this.prisma.meal.create({
      data: { userId: args.userId, status: 'processing' },
      select: { id: true },
    });
  }

  async createMeal(input: { userId: string; assetId: string }) {
    return this.prisma.meal.create({
      data: {
        userId: input.userId,
        assetId: input.assetId,
        status: 'pending',
      },
    });
  }

  async markMealFailed(mealId: string) {
    await this.prisma.meal.update({ where: { id: mealId }, data: { status: 'failed' } });
  }

  async analyzeIntoExistingMeal(args: {
    userId: string;
    mealId: string;
    buffer: Buffer;
    mime?: string;
    filename?: string;
    methodBadge?: string;
    allowCache?: boolean;
  }) {
    return this._analyzeIntoExistingMeal(args);
  }

  /** Синхронный анализ и создание приёма пищи */
  async analyzeAndCreateMeal(args: {
    userId: string;
    buffer?: Buffer;
    mime?: string;
    filename?: string;
    methodBadge?: string;
  }): Promise<{ mealId: string; status: 'ready'; items: AnalyzeResultItem[] }> {
    const { userId, buffer, mime, filename, methodBadge } = args;
    if (!userId) throw new BadRequestException('user_required');
    if (!buffer || buffer.length === 0) throw new BadRequestException('file_required');

    const asset = await this.prisma.mediaAsset.create({
      data: {
        ownerId: userId,
        s3Key: this.genS3Key(filename),
        mime: mime ?? 'application/octet-stream',
      },
      select: { id: true },
    });

    const hash = this.sha256(buffer);
    let items = await this.cacheGet(hash);
    if (!items) {
      items = await this.analyzer.analyze({ buffer, mime });
      await this.cacheSet(hash, items);
    }

    const itemsEnriched: AnalyzeResultItem[] = [];
    for (const it of items) {
      const can = await this.usda.findBestMatch(it.label);
      itemsEnriched.push({ ...it, canonicalId: can?.id ?? null });
    }

    const kcal = itemsEnriched.reduce((s, it) => s + (Number(it.kcal ?? 0) || 0), 0);

    const meal = await this.prisma.meal.create({
      data: {
        userId,
        assetId: asset.id,
        status: 'ready',
        kcalMean: kcal || null,
        methodBadge: methodBadge ?? 'analyzer',
        items: {
          create: itemsEnriched.map((it) => ({
            label: it.label,
            gramsMean: it.gramsMean ?? null,
            kcal: it.kcal ?? null,
            protein: it.protein ?? null,
            fat: it.fat ?? null,
            carbs: it.carbs ?? null,
            source: it.source ?? 'analyzer',
            canonicalId: it.canonicalId ?? null,
          })),
        },
      },
      select: { id: true },
    });

    return { mealId: meal.id, status: 'ready', items: itemsEnriched };
  }

  /** Для процессора очереди: дорисовать анализ в уже созданный meal */
  async _analyzeIntoExistingMeal(args: {
    userId: string;
    mealId: string;
    buffer: Buffer;
    mime?: string;
    filename?: string;
    methodBadge?: string;
    allowCache?: boolean;
  }) {
    const { userId, mealId, buffer, mime, methodBadge, allowCache } = args;

    const hash = this.sha256(buffer);
    let items = allowCache ? await this.cacheGet(hash) : null;
    if (!items) {
      items = await this.analyzer.analyze({ buffer, mime });
      await this.cacheSet(hash, items);
    }

    const itemsEnriched: AnalyzeResultItem[] = [];
    for (const it of items) {
      const can = await this.usda.findBestMatch(it.label);
      itemsEnriched.push({ ...it, canonicalId: can?.id ?? null });
    }

    const kcal = itemsEnriched.reduce((s, it) => s + (Number(it.kcal ?? 0) || 0), 0);

    await this.prisma.meal.update({
      where: { id: mealId, userId },
      data: {
        status: 'ready',
        kcalMean: kcal || null,
        items: {
          create: itemsEnriched.map((it) => ({
            label: it.label,
            gramsMean: it.gramsMean ?? null,
            kcal: it.kcal ?? null,
            protein: it.protein ?? null,
            fat: it.fat ?? null,
            carbs: it.carbs ?? null,
            source: it.source ?? 'analyzer',
            canonicalId: it.canonicalId ?? null,
          })),
        },
      },
    });

    return { items: itemsEnriched, status: 'ready' as const };
  }

  async listMeals(args: { userId: string; take?: number }) {
    const take = Math.min(Math.max(args.take ?? 20, 1), 100);
    const rows = await this.prisma.meal.findMany({
      where: { userId: args.userId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { items: true, asset: true },
    });

    return rows.map((m) => ({
      id: m.id,
      status: m.status,
      createdAt: m.createdAt,
      kcal: m.kcalMean ?? null,
      items: m.items.map((it) => ({
        id: it.id,
        label: it.label,
        kcal: it.kcal ?? null,
        grams: it.gramsMean ?? null,
      })),
      asset: m.asset ? { id: m.assetId, mime: m.asset.mime, s3Key: m.asset.s3Key } : null,
    }));
  }

  async getMeal(args: { userId: string; mealId: string }) {
    const m = await this.prisma.meal.findFirst({
      where: { id: args.mealId, userId: args.userId },
      include: { items: true, asset: true },
    });
    if (!m) throw new NotFoundException('meal_not_found');

    return {
      id: m.id,
      status: m.status,
      createdAt: m.createdAt,
      kcal: m.kcalMean ?? null,
      items: m.items.map((it) => ({
        id: it.id,
        label: it.label,
        kcal: it.kcal ?? null,
        grams: it.gramsMean ?? null,
      })),
      asset: m.asset ? { id: m.assetId, mime: m.asset.mime, s3Key: m.asset.s3Key } : null,
    };
  }

  async updateMeal(args: {
    userId: string;
    mealId: string;
    items: Array<{
      id?: string;
      label: string;
      grams?: number | null;
      gramsMean?: number | null;
      kcal?: number | null;
      protein?: number | null;
      fat?: number | null;
      carbs?: number | null;
      source?: string | null;
      canonicalId?: string | null;
    }>;
  }) {
    const meal = await this.prisma.meal.findFirst({
      where: { id: args.mealId, userId: args.userId },
      include: { items: true, asset: true },
    });
    if (!meal) throw new NotFoundException('meal_not_found');

    const incoming = args.items.map((it) => ({
      ...it,
      gramsMean: it.gramsMean ?? it.grams ?? null,
    }));

    const idsIncoming = new Set(incoming.filter((i) => i.id).map((i) => i.id!));
    const toDelete = meal.items.filter((e) => !idsIncoming.has(e.id)).map((e) => e.id);

    await this.prisma.$transaction(async (tx) => {
      if (toDelete.length) {
        await tx.mealItem.deleteMany({ where: { id: { in: toDelete }, mealId: meal.id } });
      }
      for (const it of incoming) {
        if (it.id) {
          await tx.mealItem.update({
            where: { id: it.id, mealId: meal.id },
            data: {
              label: it.label,
              gramsMean: it.gramsMean ?? null,
              kcal: it.kcal ?? null,
              protein: it.protein ?? null,
              fat: it.fat ?? null,
              carbs: it.carbs ?? null,
              source: it.source ?? 'manual',
              canonicalId: it.canonicalId ?? null,
            },
          });
        } else {
          await tx.mealItem.create({
            data: {
              mealId: meal.id,
              label: it.label,
              gramsMean: it.gramsMean ?? null,
              kcal: it.kcal ?? null,
              protein: it.protein ?? null,
              fat: it.fat ?? null,
              carbs: it.carbs ?? null,
              source: it.source ?? 'manual',
              canonicalId: it.canonicalId ?? null,
            },
          });
        }
      }
    });

    const updated = await this.prisma.meal.findUnique({
      where: { id: meal.id },
      include: { items: true, asset: true },
    });

    return {
      id: updated!.id,
      status: updated!.status,
      createdAt: updated!.createdAt,
      kcal: updated!.kcalMean ?? null,
      items: updated!.items.map((it) => ({
        id: it.id,
        label: it.label,
        kcal: it.kcal ?? null,
        grams: it.gramsMean ?? null,
      })),
      asset: updated!.asset ? { id: updated!.assetId, mime: updated!.asset.mime, s3Key: updated!.asset.s3Key } : null,
    };
  }

  async deleteMeal(args: { userId: string; mealId: string }) {
    const meal = await this.prisma.meal.findFirst({
      where: { id: args.mealId, userId: args.userId },
      select: { id: true },
    });
    if (!meal) throw new NotFoundException('meal_not_found');

    await this.prisma.$transaction([
      this.prisma.mealItem.deleteMany({ where: { mealId: meal.id } }),
      this.prisma.meal.delete({ where: { id: meal.id } }),
    ]);
    return { ok: true };
  }

  async recomputeMealTotals(mealId: string, userId: string) {
    const m = await this.prisma.meal.findFirst({
      where: { id: mealId, userId },
      include: { items: true },
    });
    if (!m) return;

    const kcal = m.items.reduce((s, it) => s + (Number(it.kcal ?? 0) || 0), 0);
    await this.prisma.meal.update({
      where: { id: mealId },
      data: { kcalMean: kcal || null },
    });
  }
}
