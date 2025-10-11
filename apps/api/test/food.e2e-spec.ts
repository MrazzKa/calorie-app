import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-food@example.com';
const DEVICE = 'e2e-device-food';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
  'base64'
);

describe('Food e2e (live API)', () => {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/0', { lazyConnect: false, maxRetriesPerRequest: 1 });

  it('POST /food/analyze + GET /meals', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);

    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    const up = await request(API)
      .post('/food/analyze')
      .set('authorization', `Bearer ${access}`)
      .attach('file', png1x1, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);

    expect(up.body.mealId).toMatch(/^[a-z0-9]+/i);
    expect(up.body.status).toBe('ready');
    expect(up.body.items?.length).toBeGreaterThan(0);

    const list = await request(API)
      .get('/meals')
      .set('authorization', `Bearer ${access}`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body[0].id).toBe(up.body.mealId);
  });

  it('POST /food/analyze rejects >10MB with 413', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);

    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    await request(API)
      .post('/food/analyze')
      .set('authorization', `Bearer ${access}`)
      .attach('file', big, { filename: 'big.bin', contentType: 'application/octet-stream' })
      .expect(413);
  });

    afterAll(async () => {
        await redis.quit();
    });
});
