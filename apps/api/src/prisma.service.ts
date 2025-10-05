import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (process.env.E2E_SKIP_DB_CONNECT === '1') return; // <-- ключ
    await this.$connect();
  }
  async onModuleDestroy() { await this.$disconnect(); }
}