import { DynamicModule, Module, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis, { Redis as RedisClient } from 'ioredis';

export const REDIS = Symbol('REDIS');

@Module({})
export class RedisModule implements OnModuleDestroy {
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      global: true,
      providers: [
        {
          provide: REDIS,
          useFactory: () => {
            const url = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
            const client = new Redis(url, {
              lazyConnect: true,
              maxRetriesPerRequest: 1,
            });

            if (client.status !== 'ready' && client.status !== 'connecting') {
              client.connect().catch(() => {
                // опционально: лог/метрики
              });
            }

            return client;
          },
        },
      ],
      exports: [REDIS],
    };
  }

  constructor(@Inject(REDIS) private readonly client: RedisClient) {}

  async onModuleDestroy() {
    if (this.client && (this.client.status === 'ready' || this.client.status === 'connecting')) {
      await this.client.quit().catch(() => {});
    }
  }
}
