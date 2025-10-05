import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export interface Canonical {
  id: string;
  name: string;
  source: 'USDA' | 'OFF' | 'custom';
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  score?: number;
}

@Injectable()
export class NutrientResolver {
  private readonly logger = new Logger(NutrientResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(label: string): Promise<Canonical> {
    const normalizedLabel = label.toLowerCase().trim();
    
    this.logger.debug(`Resolving nutrient data for: ${normalizedLabel}`);

    try {
      // First try exact match
      let canonical = await this.findExactMatch(normalizedLabel);
      
      if (!canonical) {
        // Try similarity search with pg_trgm
        canonical = await this.findSimilarMatch(normalizedLabel);
      }

      if (canonical) {
        this.logger.debug(`Found canonical: ${canonical.name} (${canonical.source})`);
        return canonical;
      }

      // Create custom canonical with zeros
      this.logger.warn(`No canonical found for ${normalizedLabel}, creating custom entry`);
      return this.createCustomCanonical(normalizedLabel);
    } catch (error) {
      this.logger.error(`Failed to resolve nutrient data for ${normalizedLabel}:`, error);
      return this.createCustomCanonical(normalizedLabel);
    }
  }

  private async findExactMatch(label: string): Promise<Canonical | null> {
    const food = await this.prisma.foodCanonical.findUnique({
      where: { name: label },
      include: {
        nutrients: {
          where: { unit: 'per_100g' },
        },
      },
    });

    if (!food) {
      return null;
    }

    return this.mapToCanonical(food);
  }

  private async findSimilarMatch(label: string): Promise<Canonical | null> {
    // Use pg_trgm similarity search
    const foods = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      kcalPer100g: number;
      proteinPer100g: number;
      fatPer100g: number;
      carbsPer100g: number;
      source: string;
      similarity: number;
    }>>`
      SELECT 
        id, name, "kcalPer100g", "proteinPer100g", "fatPer100g", "carbsPer100g", source,
        similarity(name, ${label}) as similarity
      FROM "FoodCanonical"
      WHERE similarity(name, ${label}) > 0.3
      ORDER BY similarity DESC
      LIMIT 3
    `;

    if (foods.length === 0) {
      return null;
    }

    // Take the best match
    const bestMatch = foods[0];
    if (bestMatch.similarity < 0.5) {
      return null;
    }

    this.logger.debug(`Found similar match: ${bestMatch.name} (similarity: ${bestMatch.similarity})`);

    return {
      id: bestMatch.id,
      name: bestMatch.name,
      source: bestMatch.source as 'USDA' | 'OFF' | 'custom',
      kcalPer100g: bestMatch.kcalPer100g,
      proteinPer100g: bestMatch.proteinPer100g,
      fatPer100g: bestMatch.fatPer100g,
      carbsPer100g: bestMatch.carbsPer100g,
      score: bestMatch.similarity,
    };
  }

  private async createCustomCanonical(label: string): Promise<Canonical> {
    // Create a custom canonical entry with zero values
    const custom = await this.prisma.foodCanonical.create({
      data: {
        name: label,
        kcalPer100g: 0,
        proteinPer100g: 0,
        fatPer100g: 0,
        carbsPer100g: 0,
        source: 'custom',
      },
    });

    // Also create nutrient entry
    await this.prisma.nutrient.create({
      data: {
        foodId: custom.id,
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        unit: 'per_100g',
      },
    });

    return {
      id: custom.id,
      name: custom.name,
      source: custom.source as 'USDA' | 'OFF' | 'custom',
      kcalPer100g: 0,
      proteinPer100g: 0,
      fatPer100g: 0,
      carbsPer100g: 0,
    };
  }

  private mapToCanonical(food: any): Canonical {
    return {
      id: food.id,
      name: food.name,
      source: food.source as 'USDA' | 'OFF' | 'custom',
      kcalPer100g: food.kcalPer100g,
      proteinPer100g: food.proteinPer100g,
      fatPer100g: food.fatPer100g,
      carbsPer100g: food.carbsPer100g,
    };
  }
}
