// apps/api/src/queues/app-bull.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

function parseRedisUrl(url: string) {
  // поддержка форматов: redis://[:password]@host:port/db
  const u = new URL(url);
  const db = u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0;
  const password = u.password || undefined;
  return {
    host: u.hostname || '127.0.0.1',
    port: Number(u.port) || 6379,
    db,
    password,
  };
}

@Module({
  imports: [
    // ВАЖНО: подключаем ConfigModule здесь,
    // и прокидываем его в forRootAsync.
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url =
          cfg.get<string>('BULL_REDIS_URL') ||
          cfg.get<string>('REDIS_URL') ||
          'redis://127.0.0.1:6379/0';

        const redis = url.startsWith('redis://')
          ? parseRedisUrl(url)
          : { host: '127.0.0.1', port: 6379, db: 0 as number };

        return {
          // конфиг для bull v3
          redis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 1000,
            attempts: 2,
            backoff: { type: 'fixed', delay: 1000 },
          },
          prefix: 'bull',
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class AppBullModule {}
