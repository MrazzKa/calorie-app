import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const rows = [
    { name: 'Banana', kcalPer100g: 89, proteinPer100g: 1.1, fatPer100g: 0.3, carbsPer100g: 23, source: 'Demo' },
    { name: 'Apple',  kcalPer100g: 52, proteinPer100g: 0.3, fatPer100g: 0.2, carbsPer100g: 14, source: 'Demo' },
    { name: 'Rice cooked', kcalPer100g: 130, proteinPer100g: 2.4, fatPer100g: 0.3, carbsPer100g: 28, source: 'Demo' },
    { name: 'Chicken breast grilled', kcalPer100g: 165, proteinPer100g: 31, fatPer100g: 3.6, carbsPer100g: 0, source: 'Demo' },
    { name: 'Egg', kcalPer100g: 155, proteinPer100g: 13, fatPer100g: 11, carbsPer100g: 1.1, source: 'Demo' },
  ];
  for (const r of rows) {
    await prisma.foodCanonical.upsert({ where: { name: r.name }, create: r, update: r });
  }
}

main().finally(() => prisma.$disconnect());
