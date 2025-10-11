import IORedis from 'ioredis';

// Set test environment defaults
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/caloriecam_test';
process.env.AUTH_DEV_IGNORE_MAIL_ERRORS = process.env.AUTH_DEV_IGNORE_MAIL_ERRORS || 'true';
process.env.ANALYZER_PROVIDER = process.env.ANALYZER_PROVIDER || 'demo';

// Global test setup - runs before all tests
beforeAll(async () => {
  // Clear Redis database before running tests
  const redis = new IORedis(process.env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.flushall();
    console.log('✅ Redis database cleared before tests');
  } catch (error) {
    console.warn('⚠️  Could not clear Redis database:', error);
  } finally {
    await redis.quit();
  }
});

// Global test teardown - runs after all tests
afterAll(async () => {
  // Optional: Clear Redis after tests as well
  const redis = new IORedis(process.env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.flushall();
    console.log('✅ Redis database cleared after tests');
  } catch (error) {
    console.warn('⚠️  Could not clear Redis database:', error);
  } finally {
    await redis.quit();
  }
});
