import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-profile@example.com';
const DEVICE = 'e2e-device-profile';

describe('Profile e2e (live API)', () => {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/0', { lazyConnect: false, maxRetriesPerRequest: 1 });

  afterAll(async () => {
    await redis.quit();
  });

  it('PATCH /users/me then GET /users/me reflects changes', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);

    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const access = v.body.access as string;

    const p1 = await request(API)
      .patch('/users/me')
      .set('authorization', `Bearer ${access}`)
      .send({ name: 'Alice', age: 30, sex: 'female' })
      .expect(200);

    expect(p1.body.ok).toBe(true);
    expect(p1.body.profile.name).toBe('Alice');
    expect(p1.body.profile.age).toBe(30);
    expect(p1.body.profile.sex).toBe('female');

    const me = await request(API)
      .get('/users/me')
      .set('authorization', `Bearer ${access}`)
      .expect(200);

    expect(me.body.profile.name).toBe('Alice');
    expect(me.body.profile.age).toBe(30);
    expect(me.body.profile.sex).toBe('female');
  });
});
