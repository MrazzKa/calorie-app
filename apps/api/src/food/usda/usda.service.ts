import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class UsdaService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestMatch(label: string) {
    const q = label.trim();
    if (!q) return null;

    const hit = await this.prisma.foodCanonical.findFirst({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true },
    });
    if (hit) return hit;

    const parts = q.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;

    return this.prisma.foodCanonical.findFirst({
      where: { OR: parts.map((p) => ({ name: { contains: p, mode: 'insensitive' } })) },
      select: { id: true },
    });
  }
}
