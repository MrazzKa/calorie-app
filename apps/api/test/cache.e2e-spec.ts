import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-cache@example.com';
const DEVICE = 'e2e-device-cache';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
  'base64'
);

describe('Cache e2e', () => {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/0', { lazyConnect: false, maxRetriesPerRequest: 1 });

  it('second analyze of same image returns cached why entries', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);
    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    // First analyze
    const up1 = await request(API)
      .post('/food/analyze')
      .set('authorization', `Bearer ${access}`)
      .attach('file', png1x1, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    const mealId1 = up1.body.mealId as string;

    // Second analyze of same file
    const up2 = await request(API)
      .post('/food/analyze')
      .set('authorization', `Bearer ${access}`)
      .attach('file', png1x1, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    const mealId2 = up2.body.mealId as string;

    // Fetch meals and check cache flags
    const m1 = await request(API)
      .get(`/meals/${mealId1}`)
      .set('authorization', `Bearer ${access}`)
      .expect(200);
    const m2 = await request(API)
      .get(`/meals/${mealId2}`)
      .set('authorization', `Bearer ${access}`)
      .expect(200);

    const why1 = m1.body?.whyJson ?? [];
    const why2 = m2.body?.whyJson ?? [];

    // Expect second one to have cache=true on entries (best-effort check)
    const hasCacheTrue = Array.isArray(why2) && why2.some((e: any) => e?.cache === true);
    expect(hasCacheTrue).toBe(true);
  });

  afterAll(async () => {
    await redis.quit();
  });
});


