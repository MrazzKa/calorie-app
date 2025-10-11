import { z } from 'zod';

// Config validation schema using Zod
export const configSchema = z.object({
  // Required core config
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  BULL_REDIS_URL: z.string().optional(),

  // JWT config
  JWT_ACCESS_TTL_SEC: z.string().default('3600'),
  JWT_REFRESH_TTL_SEC: z.string().default('2592000'),

  // S3/MinIO - optional if DISABLE_UPLOADS=true
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),

  // Analyzer config
  ANALYZER_PROVIDER: z.enum(['demo', 'openai', 'anthropic', 'local', 'gcv']).default('demo'),
  ANALYZE_MODE: z.enum(['sync', 'async']).default('sync'),

  // Optional AI provider keys - required only if provider is selected
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Feature flags
  DISABLE_LIMITS: z.string().default('false'),
  DISABLE_UPLOADS: z.string().default('false'),
  AUTH_DEV_IGNORE_MAIL_ERRORS: z.string().default('false'),

  // Rate limiting
  RL_OTP_PER_15M: z.string().default('5'),
  RL_OTP_PER_HOUR_IP: z.string().default('20'),
  RL_MAGIC_PER_15M: z.string().default('5'),
  RL_MAGIC_PER_HOUR_IP: z.string().default('20'),

  // Daily limits
  FREE_DAILY_PHOTO_LIMIT: z.string().default('5'),
  DEFAULT_ROLE: z.string().default('free'),

  // Magic link
  MAGIC_LINK_TTL_SEC: z.string().default('600'),
  APP_LINK_DOMAIN: z.string().optional(),
  APP_URL: z.string().optional(),

  // Optional mail config
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Validates environment configuration.
 * Throws if required variables are missing or invalid.
 * Logs sanitized config (without secrets).
 */
export function validateConfig(env: Record<string, any>): AppConfig {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    console.error('❌ Invalid configuration:');
    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    throw new Error('Configuration validation failed');
  }

  const config = result.data;

  // Validate conditional requirements
  if (config.DISABLE_UPLOADS !== 'true') {
    if (!config.S3_ENDPOINT || !config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 configuration is required when DISABLE_UPLOADS is not true');
    }
  }

  if (config.ANALYZER_PROVIDER === 'openai' && !config.OPENAI_API_KEY) {
    console.warn('⚠️  ANALYZER_PROVIDER=openai but OPENAI_API_KEY is not set');
  }

  if (config.ANALYZER_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANALYZER_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set');
  }

  // Log sanitized config
  logConfig(config);

  return config;
}

/**
 * Logs configuration without exposing secrets
 */
function logConfig(config: AppConfig) {
  const sanitized: Record<string, any> = { ...config };

  // Hide sensitive values
  const secretKeys = [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'S3_SECRET_ACCESS_KEY',
    'SMTP_PASS',
  ];

  secretKeys.forEach((key) => {
    if (sanitized[key]) {
      sanitized[key] = '***';
    }
  });

  // Mask database URL but show host
  if (config.DATABASE_URL) {
    try {
      const url = new URL(config.DATABASE_URL);
      sanitized.DATABASE_URL = `${url.protocol}//${url.hostname}:${url.port || '5432'}/${url.pathname.slice(1)}`;
    } catch {
      sanitized.DATABASE_URL = '***';
    }
  }

  if (config.NODE_ENV !== 'production') {
    console.log('✅ Configuration validated:');
    console.log(JSON.stringify(sanitized, null, 2));
  }
}

