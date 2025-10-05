import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-stats@example.com';
const DEVICE = 'e2e-device-stats';

describe('Stats e2e (live API)', () => {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/0', { lazyConnect: false, maxRetriesPerRequest: 1 });

  afterAll(async () => {
    await redis.quit();
  });

  it('GET /stats/daily returns totals after analyze', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);
    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    const up = await request(API)
      .post('/food/analyze')
      .set('authorization', `Bearer ${access}`)
      .attach('file', Buffer.from('stat-image'), 'meal.jpg')
      .expect(201);

    expect(up.body.mealId).toBeTruthy();

    const today = new Date().toISOString().slice(0, 10);
    const stat = await request(API)
      .get('/stats/daily')
      .query({ date: today })
      .set('authorization', `Bearer ${access}`)
      .expect(200);

    expect(stat.body.date).toBe(today);
    expect(stat.body.totals.kcal).toBeGreaterThan(0);
  });
});
