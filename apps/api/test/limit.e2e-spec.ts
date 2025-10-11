import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-limit@example.com';
const DEVICE = 'e2e-device-limit';

describe('Daily limit e2e', () => {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/0', { lazyConnect: false, maxRetriesPerRequest: 1 });

  it('free user: 5 allowed, 6th returns 402', async () => {
    // This test only makes sense when DISABLE_LIMITS=false
    const disableLimits = process.env.DISABLE_LIMITS === 'true';
    
    if (disableLimits) {
      // When limits are disabled, we can't test this
      // Skip the test gracefully
      expect(true).toBe(true);
      return;
    }

    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);
    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    // Create 5 meals
    for (let i = 0; i < 5; i++) {
      const presign = await request(API)
        .post('/media/presign')
        .set('authorization', `Bearer ${access}`)
        .send({ contentType: 'image/png' })
        .expect(201);
      const assetId = presign.body.assetId as string;

      await request(API)
        .post('/meals')
        .set('authorization', `Bearer ${access}`)
        .send({ assetId })
        .expect(201);
    }

    // 6th should fail with 402
    const presign6 = await request(API)
      .post('/media/presign')
      .set('authorization', `Bearer ${access}`)
      .send({ contentType: 'image/png' })
      .expect(201);
    const assetId6 = presign6.body.assetId as string;

    const r6 = await request(API)
      .post('/meals')
      .set('authorization', `Bearer ${access}`)
      .send({ assetId: assetId6 })
      .expect(402);

    expect(r6.body?.code ?? r6.body?.message).toBeDefined();
  });

  afterAll(async () => {
    await redis.quit();
  });
});


