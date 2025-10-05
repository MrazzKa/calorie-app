#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface FoodRecord {
  fdc_id: string;
  data_type: string;
  description: string;
  food_category_id?: string;
  publication_date?: string;
}

interface NutrientRecord {
  id: string;
  name: string;
  unit_name: string;
  nutrient_nbr?: string;
  rank?: string;
}

interface FoodNutrientRecord {
  id: string;
  fdc_id: string;
  nutrient_id: string;
  amount?: string;
  data_points?: string;
  standard_error?: string;
  min?: string;
  max?: string;
  median?: string;
  footnote?: string;
  min_year_acquired?: string;
  low_eb?: string;
  up_eb?: string;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const config = app.get(ConfigService);

  const dataDir = config.get<string>('USDA_DATA_DIR') || './data/usda';
  
  console.log('Starting USDA data import...');
  console.log(`Data directory: ${dataDir}`);

  try {
    // Read CSV files
    const foodsPath = path.join(dataDir, 'food.csv');
    const nutrientsPath = path.join(dataDir, 'nutrient.csv');
    const foodNutrientsPath = path.join(dataDir, 'food_nutrient.csv');

    if (!fs.existsSync(foodsPath) || !fs.existsSync(nutrientsPath) || !fs.existsSync(foodNutrientsPath)) {
      throw new Error(`Required CSV files not found in ${dataDir}`);
    }

    console.log('Reading CSV files...');
    
    const foods: FoodRecord[] = parse(fs.readFileSync(foodsPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true,
    });

    const nutrients: NutrientRecord[] = parse(fs.readFileSync(nutrientsPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true,
    });

    const foodNutrients: FoodNutrientRecord[] = parse(fs.readFileSync(foodNutrientsPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`Loaded ${foods.length} foods, ${nutrients.length} nutrients, ${foodNutrients.length} food-nutrient relationships`);

    // Create nutrient mapping
    const nutrientMap = new Map<string, { id: string; name: string; unit: string }>();
    
    for (const nutrient of nutrients) {
      nutrientMap.set(nutrient.id, {
        id: nutrient.id,
        name: nutrient.name,
        unit: nutrient.unit_name,
      });
    }

    // Define macro nutrients we care about
    const macroNutrients = new Map<string, string>([
      ['208', 'kcal'], // Energy (kcal)
      ['203', 'protein'], // Protein
      ['204', 'fat'], // Total lipid (fat)
      ['205', 'carbs'], // Carbohydrate, by difference
    ]);

    // Process foods and create canonical entries
    let created = 0;
    let skipped = 0;
    let processed = 0;

    console.log('Processing foods...');

    for (const food of foods) {
      processed++;
      
      if (processed % 1000 === 0) {
        console.log(`Processed ${processed}/${foods.length} foods...`);
      }

      // Skip non-foundation foods for now
      if (food.data_type !== 'Foundation') {
        continue;
      }

      const name = food.description.toLowerCase().trim();
      if (!name || name.length < 2) {
        skipped++;
        continue;
      }

      // Get nutrient data for this food
      const foodNutrientData = foodNutrients.filter(fn => fn.fdc_id === food.fdc_id);
      
      let kcalPer100g = 0;
      let proteinPer100g = 0;
      let fatPer100g = 0;
      let carbsPer100g = 0;

      for (const fn of foodNutrientData) {
        const macroType = macroNutrients.get(fn.nutrient_id);
        if (!macroType) continue;

        const amount = parseFloat(fn.amount || '0');
        if (isNaN(amount)) continue;

        switch (macroType) {
          case 'kcal':
            kcalPer100g = amount;
            break;
          case 'protein':
            proteinPer100g = amount;
            break;
          case 'fat':
            fatPer100g = amount;
            break;
          case 'carbs':
            carbsPer100g = amount;
            break;
        }
      }

      // Skip foods with no meaningful nutrition data
      if (kcalPer100g === 0 && proteinPer100g === 0 && fatPer100g === 0 && carbsPer100g === 0) {
        skipped++;
        continue;
      }

      try {
        // Upsert canonical food
        const canonical = await prisma.foodCanonical.upsert({
          where: { name },
          create: {
            name,
            kcalPer100g,
            proteinPer100g,
            fatPer100g,
            carbsPer100g,
            source: 'USDA',
          },
          update: {
            kcalPer100g,
            proteinPer100g,
            fatPer100g,
            carbsPer100g,
            source: 'USDA',
          },
        });

        // Create nutrient entry
        await prisma.nutrient.upsert({
          where: {
            foodId_unit: {
              foodId: canonical.id,
              unit: 'per_100g',
            },
          },
          create: {
            foodId: canonical.id,
            kcal: kcalPer100g,
            protein: proteinPer100g,
            fat: fatPer100g,
            carbs: carbsPer100g,
            unit: 'per_100g',
          },
          update: {
            kcal: kcalPer100g,
            protein: proteinPer100g,
            fat: fatPer100g,
            carbs: carbsPer100g,
          },
        });

        created++;
      } catch (error) {
        console.warn(`Failed to process food ${name}:`, error.message);
        skipped++;
      }
    }

    console.log(`\nImport completed!`);
    console.log(`- Created: ${created} canonical foods`);
    console.log(`- Skipped: ${skipped} foods`);
    console.log(`- Processed: ${processed} total foods`);

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}
