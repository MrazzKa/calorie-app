import request from 'supertest';
import IORedis from 'ioredis';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const API = `${BASE}/v1`;
const EMAIL = 'e2e-media@example.com';
const DEVICE = 'e2e-device-media';

// Minimal valid JPEG (2x2 pixel)
const testJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02,
  0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
  0x3f, 0x00, 0x7f, 0xff, 0xd9,
]);

describe('Media e2e (live API + MinIO)', () => {
  const redis = new IORedis(
    process.env.REDIS_URL ?? 'redis://localhost:6379/0',
    { lazyConnect: false, maxRetriesPerRequest: 1 }
  );

  afterAll(async () => {
    await redis.quit();
  });

  it('presign and real S3 upload works', async () => {
    // This test requires real S3/MinIO to work
    // Skip entirely if DISABLE_UPLOADS=true (no point testing mock S3)
    const disableUploads = process.env.DISABLE_UPLOADS === 'true';
    
    if (disableUploads) {
      // Skip this test in mock mode - it tests real S3 functionality
      expect(true).toBe(true);
      return;
    }

    // Step 1: Authenticate
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

    // Step 2: Get presigned upload URL
    const presign = await request(API)
      .post('/media/presign')
      .set('Authorization', `Bearer ${access}`)
      .send({ contentType: 'image/jpeg' })
      .expect(201);

    const { uploadUrl, assetId } = presign.body;
    expect(uploadUrl).toBeTruthy();
    expect(assetId).toMatch(/^[a-z0-9]+/i);

    // Step 3: Upload file to presigned URL (real S3/MinIO request)
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': testJpeg.length.toString(),
      },
      body: testJpeg,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`
      );
    }

    expect(uploadResponse.status).toBe(200);

    // Step 4: Verify asset was created in database
    // We can check this by creating a meal with this assetId
    const meal = await request(API)
      .post('/meals')
      .set('Authorization', `Bearer ${access}`)
      .send({ assetId })
      .expect(201);

    expect(meal.body.id).toBeTruthy();
  });

  it('presign rejects invalid content type', async () => {
    // Authenticate
    await request(API)
      .post('/auth/request-otp')
      .send({ email: EMAIL })
      .expect(201);

    const code = await redis.get(`otp:email:${EMAIL}:code`);
    const verify = await request(API)
      .post('/auth/verify-otp')
      .send({ email: EMAIL, code, deviceId: DEVICE })
      .expect(201);

    const access = verify.body.access as string;

    // Try to upload non-image content type
    const presign = await request(API)
      .post('/media/presign')
      .set('Authorization', `Bearer ${access}`)
      .send({ contentType: 'application/pdf' })
      .expect(400);

    expect(presign.body.code).toBe('invalid_content_type');
  });

  it('presign without S3 config throws error (when DISABLE_UPLOADS=false)', async () => {
    // This test only makes sense when DISABLE_UPLOADS=false
    // If DISABLE_UPLOADS=true, presign always returns mock and doesn't check S3
    const disableUploads = process.env.DISABLE_UPLOADS === 'true';
    
    if (disableUploads) {
      // When uploads are disabled, we can't test S3 config validation
      // Skip this test
      expect(true).toBe(true);
      return;
    }

    // Check if S3 is configured
    const hasS3Config = 
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY;

    if (hasS3Config) {
      // S3 is configured, this test doesn't apply
      expect(true).toBe(true);
      return;
    }

    // If we get here, S3 is not configured and uploads are not disabled
    // The presign should fail with s3_not_configured error
    await request(API)
      .post('/auth/request-otp')
      .send({ email: EMAIL })
      .expect(201);

    const code = await redis.get(`otp:email:${EMAIL}:code`);
    const verify = await request(API)
      .post('/auth/verify-otp')
      .send({ email: EMAIL, code, deviceId: DEVICE })
      .expect(201);

    const access = verify.body.access as string;

    const presign = await request(API)
      .post('/media/presign')
      .set('Authorization', `Bearer ${access}`)
      .send({ contentType: 'image/jpeg' })
      .expect(400);

    expect(presign.body.code).toBe('s3_not_configured');
  });
});

