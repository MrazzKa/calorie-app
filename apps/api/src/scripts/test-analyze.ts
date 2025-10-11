#!/usr/bin/env ts-node
/**
 * Тестовый скрипт для проверки AI анализа фото с едой
 * Запуск: ts-node -r tsconfig-paths/register src/scripts/test-analyze.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// Проверяем наличие OpenAI ключа
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY не установлен в .env');
  console.log('Добавьте в apps/api/.env:');
  console.log('OPENAI_API_KEY=sk-...');
  process.exit(1);
}

console.log('✅ OpenAI API ключ найден');
console.log('📸 Загружаем тестовое фото...\n');

// Загружаем фото
const photoPath = path.join(__dirname, '../../test/fixtures/meal1.jpg');
if (!fs.existsSync(photoPath)) {
  console.error('❌ Файл не найден:', photoPath);
  process.exit(1);
}

const buffer = fs.readFileSync(photoPath);
const sha256 = createHash('sha256').update(buffer).digest('hex');
const sizeKB = (buffer.length / 1024).toFixed(2);

console.log('📊 Информация о фото:');
console.log(`  Путь: ${photoPath}`);
console.log(`  Размер: ${sizeKB} KB`);
console.log(`  SHA256: ${sha256.substring(0, 16)}...`);
console.log('');

// Вызываем OpenAI API напрямую
async function analyzeWithOpenAI() {
  console.log('🤖 Отправляем запрос в OpenAI GPT-4 Vision...\n');
  
  const base64Image = buffer.toString('base64');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Проанализируй это фото с едой. Определи все видимые блюда и ингредиенты.
Для каждого блюда укажи:
1. Название на русском
2. Примерную массу в граммах
3. Калории (ккал)
4. Белки (г)
5. Жиры (г)  
6. Углеводы (г)

Верни ответ строго в JSON формате:
{
  "items": [
    {
      "label": "название блюда",
      "grams": число,
      "kcal": число,
      "protein": число,
      "fat": число,
      "carbs": число,
      "confidence": число от 0 до 1
    }
  ],
  "totalKcal": число,
  "notes": "дополнительные заметки"
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.3,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка OpenAI API:');
      console.error(`Status: ${response.status}`);
      console.error(errorText);
      process.exit(1);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('✅ Ответ получен!\n');
    console.log('📋 Сырой ответ от GPT-4:');
    console.log('─'.repeat(80));
    console.log(content);
    console.log('─'.repeat(80));
    console.log('');

    // Парсим JSON из ответа
    try {
      // Ищем JSON в ответе (может быть обернут в ```json)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        console.log('🍽️  РЕЗУЛЬТАТЫ АНАЛИЗА:');
        console.log('═'.repeat(80));
        
        if (result.items && Array.isArray(result.items)) {
          result.items.forEach((item: any, idx: number) => {
            console.log(`\n${idx + 1}. ${item.label.toUpperCase()}`);
            console.log(`   Масса: ${item.grams} г`);
            console.log(`   Калории: ${item.kcal} ккал`);
            console.log(`   Белки: ${item.protein} г`);
            console.log(`   Жиры: ${item.fat} г`);
            console.log(`   Углеводы: ${item.carbs} г`);
            if (item.confidence) {
              console.log(`   Уверенность: ${(item.confidence * 100).toFixed(0)}%`);
            }
          });
        }
        
        console.log('\n' + '═'.repeat(80));
        console.log(`ИТОГО КАЛОРИЙ: ${result.totalKcal || 'не указано'} ккал`);
        
        if (result.notes) {
          console.log(`\n📝 Заметки: ${result.notes}`);
        }
        
        console.log('\n✨ Анализ успешно завершен!');
        
        // Сохраняем результат в файл
        const resultPath = path.join(__dirname, '../../test/fixtures/meal1-result.json');
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
        console.log(`\n💾 Результат сохранен: ${resultPath}`);
        
      } else {
        console.log('⚠️  Не удалось извлечь JSON из ответа');
      }
    } catch (e) {
      console.log('⚠️  Ошибка парсинга JSON:', (e as Error).message);
    }

    // Информация о токенах
    if (data.usage) {
      console.log('\n📊 Использование токенов:');
      console.log(`   Запрос: ${data.usage.prompt_tokens}`);
      console.log(`   Ответ: ${data.usage.completion_tokens}`);
      console.log(`   Всего: ${data.usage.total_tokens}`);
      
      // Примерная стоимость (GPT-4o: $5/1M input, $15/1M output)
      const inputCost = (data.usage.prompt_tokens / 1000000) * 5;
      const outputCost = (data.usage.completion_tokens / 1000000) * 15;
      const totalCost = inputCost + outputCost;
      console.log(`   Стоимость: ~$${totalCost.toFixed(4)}`);
    }

  } catch (error) {
    console.error('❌ Ошибка при анализе:', error);
    process.exit(1);
  }
}

// Запуск
analyzeWithOpenAI().catch(console.error);

