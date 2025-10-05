import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [SessionsService, PrismaService],
  exports: [SessionsService],
})
export class SessionsModule {}
