#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
// TODO: user must install: pnpm -F api add csv-parse
import { parse } from 'csv-parse';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

// Type declarations for Node.js globals
declare const process: any;
declare const require: any;
declare const module: any;

type MacroKey = 'kcal' | 'protein' | 'fat' | 'carbs';

interface NutrientRow { id: string; name: string; unit_name: string }
interface FoodNutrientRow { fdc_id: string; fdcId?: string; nutrient_id: string; amount?: string }
interface FoodRow { fdc_id: string; fdcId?: string; description: string; data_type?: string; dataType?: string }

interface MacroAggregate {
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}

interface PersistItem {
  name: string;
  source: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fdcId: string;
}

function nowTs(): string { return new Date().toISOString(); }

function normalizeName(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

function normalizeType(t?: string): string {
  const v = (t || '').trim().toLowerCase();
  if (v === 'foundation foods' || v === 'foundation') return 'foundation';
  if (v === 'sr legacy') return 'sr legacy';
  if (v === 'survey (fndds)' || v === 'fndds' || v === 'survey') return 'survey (fndds)';
  if (v === 'branded') return 'branded';
  return v;
}

function isCompleteMacros(macro: MacroAggregate): boolean {
  return typeof macro.kcal === 'number' && 
         typeof macro.protein === 'number' && 
         typeof macro.fat === 'number' && 
         typeof macro.carbs === 'number';
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const config = app.get(ConfigService);

  const dataDir = config.get<string>('USDA_DATA_DIR') || path.join(process.cwd(), 'apps', 'api', 'data', 'usda');
  const maxRows = process.env.USDA_IMPORT_MAX_ROWS ? Number(process.env.USDA_IMPORT_MAX_ROWS) : undefined;
  const dataTypesEnv = process.env.USDA_IMPORT_DATATYPES;
  const allowDataTypes = dataTypesEnv ? new Set(dataTypesEnv.split(',').map(s => normalizeType(s))) : undefined;
  const batchSize = Number(process.env.USDA_IMPORT_BATCH_SIZE || '1000');
  const logEvery = Number(process.env.USDA_IMPORT_LOG_EVERY || '100000');
  const dryRun = process.env.USDA_IMPORT_DRYRUN === '1';
  const debug = process.env.USDA_IMPORT_DEBUG === '1';

  const nutrientsPath = path.join(dataDir, 'nutrient.csv');
  const foodNutrientsPath = path.join(dataDir, 'food_nutrient.csv');
  const foodsPath = path.join(dataDir, 'food.csv');

  console.log(`[${nowTs()}] USDA import start. dir=${dataDir}`);
  if (maxRows) console.log(`[${nowTs()}] max rows: ${maxRows}`);
  if (dataTypesEnv) console.log(`[${nowTs()}] filter data_types=[${dataTypesEnv}]`);
  else console.log(`[${nowTs()}] filter disabled`);
  if (dryRun) console.log(`[${nowTs()}] DRY RUN mode - no DB writes`);
  if (debug) console.log(`[${nowTs()}] DEBUG mode enabled`);

  try {
    for (const p of [nutrientsPath, foodNutrientsPath, foodsPath]) {
      if (!fs.existsSync(p)) throw new Error(`missing file: ${p}`);
    }

    // Phase 1: read nutrient.csv to find target nutrient_ids
    const t1 = Date.now();
    const targetById = new Map<string, MacroKey>();
    const nutrientStream = fs.createReadStream(nutrientsPath);
    const nutrientParser = parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });

    await new Promise<void>((resolve, reject) => {
      nutrientStream
        .pipe(nutrientParser)
        .on('data', (row: NutrientRow) => {
          const name = String(row.name || '').trim();
          const unit = String(row.unit_name || '').trim().toLowerCase();
          if (name === 'Energy' && unit === 'kcal') targetById.set(String(row.id), 'kcal');
          else if (name === 'Protein' && unit === 'g') targetById.set(String(row.id), 'protein');
          else if (name === 'Total lipid (fat)' && unit === 'g') targetById.set(String(row.id), 'fat');
          else if (name === 'Carbohydrate, by difference' && unit === 'g') targetById.set(String(row.id), 'carbs');
        })
        .on('error', (e: Error) => reject(e))
        .on('end', () => resolve());
    });
    console.log(`[${nowTs()}] nutrient: loaded ${targetById.size} target nutrients`);

    // Phase 1: stream food_nutrient.csv and aggregate macros per food_id
    const t2 = Date.now();
    const agg = new Map<string, MacroAggregate>();
    let rows = 0;
    let uniqueFoods = 0;
    let maxLogged = false;
    
    const fnStream = fs.createReadStream(foodNutrientsPath);
    const fnParser = parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      to: maxRows && maxRows > 0 ? maxRows : undefined, // hard cap by env
    });
    
    fnStream.pipe(fnParser);
    
    for await (const row of fnParser) {
      rows++;
      const macro = targetById.get(String(row.nutrient_id));
      if (!macro) continue;
      const fdcKey = String(row.fdc_id ?? row.fdcId);
      const amount = Number(row.amount ?? '0');
      if (!Number.isFinite(amount)) continue;
      
      let entry = agg.get(fdcKey);
      if (!entry) {
        entry = { kcal: undefined, protein: undefined, fat: undefined, carbs: undefined };
        agg.set(fdcKey, entry);
        uniqueFoods++;
      }
      const prev = (entry as any)[macro] || 0;
      (entry as any)[macro] = prev + amount;
      
      if (rows % logEvery === 0) console.log(`[${nowTs()}] food_nutrient: processed ${rows} rows, unique foods ${uniqueFoods}`);
      
      if (!maxLogged && maxRows && maxRows > 0 && rows === maxRows) {
        console.log(`[${nowTs()}] food_nutrient: reached max rows limit (${maxRows}), stopping early`);
        maxLogged = true; // don't log repeatedly
        // DO NOT destroy/close streams here — just continue; parser will stop itself due to `to:`
      }
    }
    
    console.log(`[${nowTs()}] phase1: rows=${rows}, unique_food_ids=${uniqueFoods}`);

    // Phase 2: stream food.csv and persist in batches
    const t3 = Date.now();
    const foodStream = fs.createReadStream(foodsPath);
    const foodParser = parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
    const batch: PersistItem[] = [];
    let persisted = 0;
    let considered = 0;
    let matchedFoods = 0;
    let toPersist = 0;
    let completeMacros = 0;
    let skipped = 0;
    let batchIndex = 0;
    const dataTypeHistogram = new Map<string, number>();
    let hasAppliedTypeFilter = false;
    let autoFallbackUsed = false;

    async function flushBatch() {
      if (batch.length === 0) return;
      const slice = batch.splice(0, batch.length);
      batchIndex++;
      
      if (!dryRun) {
        for (const item of slice) {
          try {
            const canonical = await prisma.foodCanonical.upsert({
              where: { name: item.name },
              create: {
                name: item.name,
                kcalPer100g: item.kcal,
                proteinPer100g: item.protein,
                fatPer100g: item.fat,
                carbsPer100g: item.carbs,
                source: item.source,
              },
              update: {
                kcalPer100g: item.kcal,
                proteinPer100g: item.protein,
                fatPer100g: item.fat,
                carbsPer100g: item.carbs,
                source: item.source,
              },
            });
            
            const existing = await prisma.nutrient.findFirst({
              where: { foodId: canonical.id, unit: 'per_100g' },
              select: { id: true },
            });
            if (existing) {
              await prisma.nutrient.update({
                where: { id: existing.id },
                data: {
                  kcal: item.kcal,
                  protein: item.protein,
                  fat: item.fat,
                  carbs: item.carbs,
                },
              });
            } else {
              await prisma.nutrient.create({
                data: {
                  foodId: canonical.id,
                  unit: 'per_100g',
                  kcal: item.kcal,
                  protein: item.protein,
                  fat: item.fat,
                  carbs: item.carbs,
                },
              });
            }
            
            completeMacros++;
          } catch (e) {
            if (debug) console.warn(`[${nowTs()}] Failed to persist ${item.name}:`, (e as Error).message);
            skipped++;
          } finally {
            persisted++;
            agg.delete(item.fdcId);
          }
        }
      } else {
        // Dry run: just count
        for (const item of slice) {
          persisted++;
          completeMacros++;
          agg.delete(item.fdcId);
        }
      }
      
      console.log(`[${nowTs()}] food: persisted ${persisted} foods (batch ${batchIndex})`);
    }

    await new Promise<void>((resolve, reject) => {
      foodStream
        .pipe(foodParser)
        .on('data', async (row: FoodRow) => {
          considered++;
          const fdcKey = String(row.fdc_id ?? row.fdcId);
          
          if (!agg.has(fdcKey)) return;
          const macro = agg.get(fdcKey);
          if (!macro) return;
          
          const rowType = normalizeType(row.data_type ?? row.dataType);
          dataTypeHistogram.set(rowType, (dataTypeHistogram.get(rowType) || 0) + 1);
          
          // Apply data_type filter if enabled
          if (allowDataTypes && allowDataTypes.size > 0) {
            hasAppliedTypeFilter = true;
            if (!allowDataTypes.has(rowType)) {
              return;
            }
          }
          
          matchedFoods++;
          
          // Check if we have complete macros
          if (!isCompleteMacros(macro)) {
            skipped++;
            agg.delete(fdcKey);
            return;
          }
          
          toPersist++;
          
          const desc = row.description?.trim() || '';
          const dataType = row.data_type?.trim() ?? 'USDA';
          const nameBase = desc || `usda:${fdcKey}`;
          let name = normalizeName(nameBase);
          
          // Handle potential name conflicts by adding fdc_id suffix
          if (name.length === 0) {
            name = `usda:${fdcKey}`;
          }
          
          const source = `usda:${dataType}`;
          
          const item: PersistItem = {
            name,
            source,
            kcal: Number(macro.kcal || 0),
            protein: Number(macro.protein || 0),
            fat: Number(macro.fat || 0),
            carbs: Number(macro.carbs || 0),
            fdcId: fdcKey,
          };
          
          batch.push(item);
          
          if (batch.length >= batchSize) {
            foodParser.pause();
            flushBatch().then(() => foodParser.resume()).catch(reject);
          }
        })
        .on('error', (e: Error) => reject(e))
        .on('end', async () => {
          try {
            // Check for auto-fallback if no matches after type filter
            if (hasAppliedTypeFilter && matchedFoods === 0 && !autoFallbackUsed && dataTypeHistogram.size > 0) {
              console.warn(`[${nowTs()}] WARN: No foods matched after data_type filter. Histogram: ${Array.from(dataTypeHistogram.entries()).map(([k,v]) => `${k}:${v}`).join(', ')}`);
              console.warn(`[${nowTs()}] AUTO-FALLBACK: Skipping data_type filter and retrying...`);
              autoFallbackUsed = true;
              matchedFoods = 0;
              
              // Re-process food.csv without type filter
              const fallbackStream = fs.createReadStream(foodsPath);
              const fallbackParser = parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
              
              await new Promise<void>((fallbackResolve, fallbackReject) => {
                fallbackStream
                  .pipe(fallbackParser)
                  .on('data', async (row: FoodRow) => {
                    const fdcKey = String(row.fdc_id ?? row.fdcId);
                    if (!agg.has(fdcKey)) return;
                    const macro = agg.get(fdcKey);
                    if (!macro) return;
                    
                    matchedFoods++;
                    
                    if (!isCompleteMacros(macro)) {
                      skipped++;
                      agg.delete(fdcKey);
                      return;
                    }
                    
                    toPersist++;
                    
                    const desc = row.description?.trim() || '';
                    const dataType = row.data_type?.trim() ?? 'USDA';
                    const nameBase = desc || `usda:${fdcKey}`;
                    let name = normalizeName(nameBase);
                    
                    if (name.length === 0) {
                      name = `usda:${fdcKey}`;
                    }
                    
                    const source = `usda:${dataType}`;
                    
                    const item: PersistItem = {
                      name,
                      source,
                      kcal: Number(macro.kcal || 0),
                      protein: Number(macro.protein || 0),
                      fat: Number(macro.fat || 0),
                      carbs: Number(macro.carbs || 0),
                      fdcId: fdcKey,
                    };
                    
                    batch.push(item);
                    
                    if (batch.length >= batchSize) {
                      fallbackParser.pause();
                      flushBatch().then(() => fallbackParser.resume()).catch(fallbackReject);
                    }
                  })
                  .on('error', (e: Error) => fallbackReject(e))
                  .on('end', async () => {
                    try {
                      await flushBatch();
                      fallbackResolve();
                    } catch (e) {
                      fallbackReject(e as Error);
                    }
                  });
              });
            }
            
            await flushBatch();
            resolve();
          } catch (e) {
            reject(e as Error);
          }
        });
    });

    console.log(`[${nowTs()}] phase2: matched_foods=${matchedFoods} (after data_type filter)`);
    console.log(`[${nowTs()}] phase2: to_persist=${toPersist} (complete macros only)`);
    
    if (debug && dataTypeHistogram.size > 0) {
      console.log(`[${nowTs()}] DEBUG: data_type histogram for matched FDC IDs: ${Array.from(dataTypeHistogram.entries()).map(([k,v]) => `${k}:${v}`).join(', ')}`);
    }

    console.log(`\nImport completed`);
    console.log(`- Foods persisted: ${persisted}`);
    console.log(`- With complete macros: ${completeMacros}`);
    console.log(`- Skipped (filter/type/empty): ${skipped}`);
    
    if (debug) {
      console.log(`\nDebug stats:`);
      console.log(`- Phase 1 duration: ${Date.now() - t2}ms`);
      console.log(`- Phase 2 duration: ${Date.now() - t3}ms`);
      console.log(`- Total duration: ${Date.now() - t1}ms`);
      console.log(`- Remaining in agg map: ${agg.size}`);
    }
    
  } catch (error) {
    const corr = nowTs();
    console.error(`[${corr}] Import failed:`, (error as Error).message);
    if (debug) console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}