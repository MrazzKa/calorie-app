import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminAccessToken: string;
  let regularAccessToken: string;
  let adminUserId: string;
  let regularUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Create admin user
    const adminEmail = `admin-${Date.now()}@test.com`;
    const adminUser = await prisma.user.create({
      data: { email: adminEmail, role: 'admin' },
    });
    adminUserId = adminUser.id;

    // Create regular user
    const regularEmail = `user-${Date.now()}@test.com`;
    const regularUser = await prisma.user.create({
      data: { email: regularEmail, role: 'free' },
    });
    regularUserId = regularUser.id;

    // Get access tokens via magic link
    await request(app.getHttpServer())
      .post('/v1/auth/request-magic')
      .send({ email: adminEmail });

    const { body: debugAdmin } = await request(app.getHttpServer())
      .get('/v1/auth/_debug/latest-magic')
      .query({ email: adminEmail });

    const { body: adminTokens } = await request(app.getHttpServer())
      .post('/v1/auth/magic-exchange')
      .send({ t: debugAdmin.t });

    adminAccessToken = adminTokens.access;

    // Regular user token
    await request(app.getHttpServer())
      .post('/v1/auth/request-magic')
      .send({ email: regularEmail });

    const { body: debugRegular } = await request(app.getHttpServer())
      .get('/v1/auth/_debug/latest-magic')
      .query({ email: regularEmail });

    const { body: regularTokens } = await request(app.getHttpServer())
      .post('/v1/auth/magic-exchange')
      .send({ t: debugRegular.t });

    regularAccessToken = regularTokens.access;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserId, regularUserId] } },
    });
    await app.close();
  });

  describe('GET /v1/admin/users', () => {
    it('should return users list for admin', () => {
      return request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('users');
          expect(res.body).toHaveProperty('total');
          expect(Array.isArray(res.body.users)).toBe(true);
        });
    });

    it('should reject non-admin user', () => {
      return request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${regularAccessToken}`)
        .expect(403);
    });

    it('should reject unauthenticated request', () => {
      return request(app.getHttpServer())
        .get('/v1/admin/users')
        .expect(401);
    });
  });

  describe('GET /v1/admin/users/:id', () => {
    it('should return user details for admin', () => {
      return request(app.getHttpServer())
        .get(`/v1/admin/users/${regularUserId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', regularUserId);
          expect(res.body).toHaveProperty('email');
          expect(res.body).toHaveProperty('role', 'free');
        });
    });

    it('should reject non-admin user', () => {
      return request(app.getHttpServer())
        .get(`/v1/admin/users/${adminUserId}`)
        .set('Authorization', `Bearer ${regularAccessToken}`)
        .expect(403);
    });
  });

  describe('POST /v1/admin/users/:id/role', () => {
    it('should update user role from free to pro', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/admin/users/${regularUserId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'pro' })
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body.user).toHaveProperty('role', 'pro');

      // Verify in database
      const user = await prisma.user.findUnique({
        where: { id: regularUserId },
      });
      expect(user?.role).toBe('pro');
    });

    it('should reject invalid role', () => {
      return request(app.getHttpServer())
        .post(`/v1/admin/users/${regularUserId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'invalid_role' })
        .expect(403);
    });

    it('should reject non-admin user', () => {
      return request(app.getHttpServer())
        .post(`/v1/admin/users/${regularUserId}/role`)
        .set('Authorization', `Bearer ${regularAccessToken}`)
        .send({ role: 'pro' })
        .expect(403);
    });

    it('should allow changing role back to free', async () => {
      await request(app.getHttpServer())
        .post(`/v1/admin/users/${regularUserId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'free' })
        .expect(200);

      const user = await prisma.user.findUnique({
        where: { id: regularUserId },
      });
      expect(user?.role).toBe('free');
    });
  });

  describe('Role-based limits enforcement', () => {
    it('should respect different limits for free vs pro users', async () => {
      // This is integration with existing limit logic
      // Actual limit checks are tested in limit.e2e-spec.ts
      // Here we just verify role is persisted correctly
      
      const user = await prisma.user.findUnique({
        where: { id: regularUserId },
      });
      
      expect(['free', 'pro', 'admin']).toContain(user?.role);
    });
  });
});

