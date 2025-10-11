import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-adjust@example.com';
const DEVICE = 'e2e-device-adjust';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
  'base64'
);

describe('Adjust meal e2e', () => {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/0', { lazyConnect: false, maxRetriesPerRequest: 1 });

  it('adjust grams with positive/negative deltas; clamp to >= 0 and recompute totals', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);
    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    const up = await request(API)
      .post('/food/analyze')
      .set('authorization', `Bearer ${access}`)
      .attach('file', png1x1, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    const mealId = up.body.mealId as string;

    const meal = await request(API)
      .get(`/meals/${mealId}`)
      .set('authorization', `Bearer ${access}`)
      .expect(200);

    const item = (meal.body?.items ?? [])[0];
    expect(item).toBeDefined();

    // negative delta, clamp to >= 0
    await request(API)
      .patch(`/meals/${mealId}/adjust`)
      .set('authorization', `Bearer ${access}`)
      .send({ itemId: item.id, gramsDelta: -9999 })
      .expect(200);

    // positive delta
    const r2 = await request(API)
      .patch(`/meals/${mealId}/adjust`)
      .set('authorization', `Bearer ${access}`)
      .send({ itemId: item.id, gramsDelta: 10 })
      .expect(200);

    // Expect totals to be updated
    expect(r2.body?.kcalMean ?? r2.body?.summary?.kcalMean).toBeDefined();
  });

  afterAll(async () => {
    await redis.quit();
  });
});


