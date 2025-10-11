import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Prisma');
  async onModuleInit() {
    if (process.env.E2E_SKIP_DB_CONNECT === '1') return; // <-- ключ
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      await this.$connect();
      return;
    }
    // note: simple retry in dev/test
    const max = 5;
    for (let i = 1; i <= max; i++) {
      try {
        await this.$connect();
        if (i > 1) this.log.log(`connected on attempt ${i}`);
        break;
      } catch (e) {
        if (i === max) throw e;
        this.log.warn(`connect failed (attempt ${i}/${max}), retrying...`);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  async onModuleDestroy() { await this.$disconnect(); }
}