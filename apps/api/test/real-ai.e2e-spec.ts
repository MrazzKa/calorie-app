import request from 'supertest';
import IORedis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E тест для реального AI анализа
 * 
 * Запуск:
 * ANALYZER_PROVIDER=openai ANALYZE_MODE=sync OPENAI_API_KEY=sk-... pnpm jest test/real-ai.e2e-spec.ts
 */

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-real-ai@example.com';
const DEVICE = 'e2e-device-real-ai';

describe('Real AI Analysis e2e', () => {
  const redis = new IORedis(
    process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    { lazyConnect: false, maxRetriesPerRequest: 1 }
  );

  // Пропускаем тест если не установлен OpenAI ключ
  const skipTest = !process.env.OPENAI_API_KEY || process.env.ANALYZER_PROVIDER !== 'openai';

  if (skipTest) {
    it.skip('skipped - set OPENAI_API_KEY and ANALYZER_PROVIDER=openai to run', () => {
      expect(true).toBe(true);
    });
    return;
  }

  afterAll(async () => {
    await redis.quit();
  });

  it('should analyze real food photo with OpenAI', async () => {
    console.log('\n🤖 Тестируем реальный AI анализ...\n');

    // 1. Авторизация
    await request(API)
      .post('/auth/request-otp')
      .send({ email: EMAIL })
      .expect(201);

    const code = await redis.get(`otp:email:${EMAIL}:code`);
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(API)
      .post('/auth/verify-otp')
      .send({ email: EMAIL, code, deviceId: DEVICE })
      .expect(201);

    const access = verify.body.access as string;
    expect(access).toBeTruthy();

    console.log('✅ Авторизация успешна\n');

    // 2. Загружаем реальное фото
    const photoPath = path.join(__dirname, 'fixtures', 'meal1.jpg');
    if (!fs.existsSync(photoPath)) {
      throw new Error(`Фото не найдено: ${photoPath}`);
    }

    const photoBuffer = fs.readFileSync(photoPath);
    const sizeKB = (photoBuffer.length / 1024).toFixed(2);
    console.log(`📸 Загружаем фото: ${sizeKB} KB\n`);

    // 3. Отправляем на анализ
    console.log('⏳ Ожидаем ответ от OpenAI (может занять 10-30 сек)...\n');
    
    const startTime = Date.now();
    
    const analyze = await request(API)
      .post('/food/analyze')
      .set('Authorization', `Bearer ${access}`)
      .attach('file', photoBuffer, 'meal1.jpg')
      .expect(201);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 4. Проверяем результат
    expect(analyze.body.mealId).toBeTruthy();
    expect(analyze.body.status).toBe('ready');
    expect(analyze.body.items).toBeDefined();
    expect(Array.isArray(analyze.body.items)).toBe(true);
    expect(analyze.body.items.length).toBeGreaterThan(0);

    console.log(`✅ Анализ завершен за ${duration}s\n`);

    // 5. Выводим результаты
    console.log('🍽️  РЕЗУЛЬТАТЫ АНАЛИЗА:');
    console.log('═'.repeat(80));
    
    let totalKcal = 0;
    
    analyze.body.items.forEach((item: any, idx: number) => {
      console.log(`\n${idx + 1}. ${item.label.toUpperCase()}`);
      if (item.gramsMean) {
        console.log(`   Масса: ${item.gramsMean} г`);
      }
      if (item.kcal) {
        console.log(`   Калории: ${item.kcal} ккал`);
        totalKcal += item.kcal;
      }
      if (item.protein) {
        console.log(`   Белки: ${item.protein} г`);
      }
      if (item.fat) {
        console.log(`   Жиры: ${item.fat} г`);
      }
      if (item.carbs) {
        console.log(`   Углеводы: ${item.carbs} г`);
      }
    });

    console.log('\n' + '═'.repeat(80));
    console.log(`ИТОГО КАЛОРИЙ: ${totalKcal} ккал`);
    console.log('═'.repeat(80) + '\n');

    // 6. Проверяем что данные корректные
    analyze.body.items.forEach((item: any) => {
      expect(item.label).toBeTruthy();
      expect(typeof item.label).toBe('string');
      
      // Хотя бы одно из значений должно быть заполнено
      const hasNutrition = item.kcal || item.protein || item.fat || item.carbs || item.gramsMean;
      expect(hasNutrition).toBeTruthy();
    });

    // 7. Получаем детали из БД
    const meal = await request(API)
      .get(`/meals/${analyze.body.mealId}`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    expect(meal.body.id).toBe(analyze.body.mealId);
    expect(meal.body.status).toBe('ready');
    
    // 8. Проверяем что кэш работает
    console.log('🔄 Проверяем кэширование...\n');
    
    const analyze2 = await request(API)
      .post('/food/analyze')
      .set('Authorization', `Bearer ${access}`)
      .attach('file', photoBuffer, 'meal1.jpg')
      .expect(201);

    // Второй анализ должен быть быстрее (из кэша)
    expect(analyze2.body.mealId).toBeTruthy();
    expect(analyze2.body.status).toBe('ready');
    
    // Проверяем наличие флага кэширования в whyJson
    const meal2 = await request(API)
      .get(`/meals/${analyze2.body.mealId}`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    const whyJson = meal2.body.whyJson;
    expect(Array.isArray(whyJson)).toBe(true);
    
    const hasCacheFlag = whyJson.some((entry: any) => entry.cache === true);
    expect(hasCacheFlag).toBe(true);
    
    console.log('✅ Кэширование работает корректно\n');

    // 9. Сохраняем результат в файл
    const resultPath = path.join(__dirname, 'fixtures', 'meal1-ai-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      meal: meal.body,
      items: analyze.body.items,
      duration: `${duration}s`,
      timestamp: new Date().toISOString(),
    }, null, 2));

    console.log(`💾 Результат сохранен: ${resultPath}\n`);
    console.log('✨ Тест успешно завершен!\n');
  }, 60000); // 60 секунд таймаут для AI анализа
});

