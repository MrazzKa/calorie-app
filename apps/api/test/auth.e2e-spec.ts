import request from 'supertest';
import Redis from 'ioredis';

jest.setTimeout(30000);

describe('Auth e2e (live API)', () => {
  const API = 'http://localhost:3000/v1';
  const EMAIL = 'e2e@example.com';
  const DEVICE = 'android-e2e';

  let redis: Redis;

  beforeAll(async () => {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(url);
    await redis.ping();
  });

  afterAll(async () => {
    if (redis) await redis.quit();
  });

  it('OTP + Access works', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201).expect({ ok: true });

    const code = await redis.get(`otp:email:${EMAIL}:code`);
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);

    expect(verify.body.access).toBeTruthy();
    expect(verify.body.refresh).toBeTruthy();
    expect(verify.body.jti).toBeTruthy();

    await request(API).get('/users/me').set('authorization', `Bearer ${verify.body.access}`).expect(200);
  });

  it('Magic link happy + reuse=401', async () => {
    await request(API).post('/auth/request-magic').send({ email: EMAIL }).expect(201).expect({ ok: true });

    // берём plaintext t из dev-эндпоинта
    const dbg = await request(API).get(`/auth/_debug/latest-magic`).query({ email: EMAIL }).expect(200);
    const t = dbg.body.t as string;
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);

    const ex1 = await request(API).post('/auth/magic-exchange').send({ t, deviceId: DEVICE }).expect(201);
    expect(ex1.body.access).toBeTruthy();

    // повтор — 401
    await request(API).post('/auth/magic-exchange').send({ t, deviceId: DEVICE }).expect(401);
  });

  it('Refresh rotation + logout + logout-all', async () => {
    await request(API).post('/auth/request-otp').send({ email: EMAIL }).expect(201);
    const code = await redis.get(`otp:email:${EMAIL}:code`);

    const v = await request(API).post('/auth/verify-otp').send({ email: EMAIL, code, deviceId: DEVICE }).expect(201);
    const { access, refresh, jti } = v.body;

    const r1 = await request(API).post('/auth/refresh').send({ refresh, jti }).expect(201);
    const { refresh: newRefresh, jti: newJti, access: newAccess } = r1.body;

    await request(API).post('/auth/refresh').send({ refresh, jti }).expect(401);

    await request(API).post('/auth/logout').send({ jti: newJti }).expect(201);

    await request(API).post('/auth/refresh').send({ refresh: newRefresh, jti: newJti }).expect(401);

    await request(API).post('/auth/logout-all').set('authorization', `Bearer ${newAccess}`).expect(201);
  });
});
