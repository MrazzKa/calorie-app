/**
 * USDA FDC → FoodCanonical (быстрый импорт для демо)
 * - Стрим CSV
 * - Лимит по количеству продуктов (USDA_LIMIT)
 * - Прогресс-логи
 * - createMany(skipDuplicates) для скорости
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DIR = process.env.USDA_DATA_DIR || './data/usda';
const H = (s: string) => String(s).trim().toLowerCase().replace(/[\s\-]+/g, '_');

const LIMIT = Number(process.env.USDA_LIMIT || '50000'); // для демо
const BATCH_SIZE = Number(process.env.USDA_BATCH || '1000');
const LOG_EVERY_N_FOODNUTR_ROWS = Number(process.env.USDA_PROGRESS || '200000');

function pick(...names: string[]) {
  for (const n of names) {
    const p = path.join(DIR, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readNutrientIds(file: string) {
  const txt = fs.readFileSync(file, 'utf8'); // небольшой
  const rows: any[] = parseSync(txt, { columns: (hdr: string[]) => hdr.map(H), skip_empty_lines: true });

  const getId = (name: string, unit?: string) => {
    const ln = name.toLowerCase();
    const lu = unit ? unit.toLowerCase() : undefined;
    const row: any = rows.find(
      (r) =>
        String(r.name || '').trim().toLowerCase() === ln &&
        (lu ? String(r.unit_name || '').trim().toLowerCase() === lu : true),
    );
    return row ? Number(row.id) : undefined;
  };

  const ENERGY = getId('energy', 'kcal');
  const PROT = getId('protein', 'g');
  const FAT = getId('total lipid (fat)', 'g');
  const CARB = getId('carbohydrate, by difference', 'g');

  if (!ENERGY || !PROT || !FAT || !CARB) throw new Error('Required nutrient IDs not found');
  return { ENERGY, PROT, FAT, CARB };
}

async function buildFoodMap(file: string) {
  const map = new Map<number, { description: string }>();
  let seen = 0;
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(file)
      .pipe(parse({ columns: (h: string[]) => h.map(H) }))
      .on('data', (r: any) => {
        const id = Number(r.fdc_id);
        if (!Number.isFinite(id)) return;
        map.set(id, { description: String(r.description || '') });
        if (++seen % 200000 === 0) console.log(`[food.csv] rows: ${seen}`);
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`[food.csv] total rows: ${seen}, unique fdc_ids: ${map.size}`);
  return map;
}

async function aggregateFoodNutrients(
  file: string,
  foodMap: Map<number, { description: string }>,
  ids: { ENERGY: number; PROT: number; FAT: number; CARB: number },
) {
  const agg = new Map<number, { kcal?: number; p?: number; f?: number; c?: number }>();
  let rn = 0;
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(file)
      .pipe(parse({ columns: (h: string[]) => h.map(H) }))
      .on('data', (r: any) => {
        rn++;
        if (rn % LOG_EVERY_N_FOODNUTR_ROWS === 0) console.log(`[food_nutrient.csv] parsed rows: ${rn}`);
        const fdc = Number(r.fdc_id);
        if (!foodMap.has(fdc)) return;
        const nid = Number(r.nutrient_id);
        const amt = Number(r.amount);
        if (!Number.isFinite(amt)) return;

        let e = agg.get(fdc);
        if (!e) { e = {}; agg.set(fdc, e); }
        if (nid === ids.ENERGY) e.kcal = amt;
        else if (nid === ids.PROT) e.p = amt;
        else if (nid === ids.FAT) e.f = amt;
        else if (nid === ids.CARB) e.c = amt;
      })
      .on('end', resolve)
      .on('error', reject);
  });
  console.log(`[food_nutrient.csv] aggregated foods with any metrics: ${agg.size}`);
  return agg;
}

async function createManyBatch(rows: any[]) {
  if (rows.length === 0) return;
  await prisma.foodCanonical.createMany({ data: rows, skipDuplicates: true });
}

(async function run() {
  const fFood = pick('Food.csv', 'food.csv');
  const fNutr = pick('Nutrient.csv', 'nutrient.csv');
  const fFoodNutr = pick('FoodNutrient.csv', 'food_nutrient.csv');

  if (!fFood || !fNutr || !fFoodNutr) {
    console.error('Place Food.csv/food.csv, Nutrient.csv/nutrient.csv, FoodNutrient.csv/food_nutrient.csv into', DIR);
    process.exit(1);
  }

  console.log(`[init] DIR=${DIR}`);
  const ids = readNutrientIds(fNutr);
  console.log(`[ids] ENERGY=${ids.ENERGY} PROT=${ids.PROT} FAT=${ids.FAT} CARB=${ids.CARB}`);

  const foodMap = await buildFoodMap(fFood);
  const agg = await aggregateFoodNutrients(fFoodNutr, foodMap, ids);

  let upserted = 0;
  const batch: any[] = [];
  for (const [fdcId, vals] of agg.entries()) {
    if (LIMIT && upserted >= LIMIT) break;
    if (vals.kcal == null) continue;
    const meta = foodMap.get(fdcId)!;
    batch.push({
      name: String(meta.description),
      kcalPer100g: Number(vals.kcal),
      proteinPer100g: Number(vals.p ?? 0),
      fatPer100g: Number(vals.f ?? 0),
      carbsPer100g: Number(vals.c ?? 0),
      source: 'USDA/FDC',
    });
    if (batch.length >= BATCH_SIZE) {
      await createManyBatch(batch);
      upserted += batch.length;
      console.log(`[insert] total inserted ~${upserted}`);
      batch.length = 0;
    }
  }
  if (batch.length) {
    await createManyBatch(batch);
    upserted += batch.length;
  }

  console.log(`[done] inserted ~${upserted}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
