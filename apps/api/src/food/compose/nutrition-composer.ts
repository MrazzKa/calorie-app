import { Injectable, Logger } from '@nestjs/common';

export interface NutritionItem {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface MealSummary {
  kcalMean: number;
  kcalMin: number;
  kcalMax: number;
  confidence: number;
  methodBadge: string;
}

@Injectable()
export class NutritionComposer {
  private readonly logger = new Logger(NutritionComposer.name);

  computeItem(grams: number, per100g: {
    kcalPer100g: number;
    proteinPer100g: number;
    fatPer100g: number;
    carbsPer100g: number;
  }): NutritionItem {
    const multiplier = grams / 100;
    
    return {
      kcal: Math.round(per100g.kcalPer100g * multiplier),
      protein: Math.round(per100g.proteinPer100g * multiplier * 10) / 10,
      fat: Math.round(per100g.fatPer100g * multiplier * 10) / 10,
      carbs: Math.round(per100g.carbsPer100g * multiplier * 10) / 10,
    };
  }

  computeMealSummary(items: Array<{
    gramsMin?: number;
    gramsMax?: number;
    gramsMean: number;
    per100g: {
      kcalPer100g: number;
      proteinPer100g: number;
      fatPer100g: number;
      carbsPer100g: number;
    };
  }>): MealSummary {
    let kcalMean = 0;
    let kcalMin = 0;
    let kcalMax = 0;

    for (const item of items) {
      const meanKcal = this.computeItem(item.gramsMean, item.per100g).kcal;
      kcalMean += meanKcal;

      if (item.gramsMin !== undefined) {
        kcalMin += this.computeItem(item.gramsMin, item.per100g).kcal;
      }

      if (item.gramsMax !== undefined) {
        kcalMax += this.computeItem(item.gramsMax, item.per100g).kcal;
      }
    }

    // If min/max weren't provided, calculate based on mean
    if (kcalMin === 0) {
      kcalMin = Math.round(kcalMean * 0.9);
    }
    if (kcalMax === 0) {
      kcalMax = Math.round(kcalMean * 1.1);
    }

    return {
      kcalMean,
      kcalMin,
      kcalMax,
      confidence: 0.7,
      methodBadge: 'd2',
    };
  }

  computeMealItemNutrition(item: {
    gramsMean: number;
    gramsMin?: number;
    gramsMax?: number;
    canonical: {
      kcalPer100g: number;
      proteinPer100g: number;
      fatPer100g: number;
      carbsPer100g: number;
    };
  }): {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  } {
    return this.computeItem(item.gramsMean, item.canonical);
  }
}
