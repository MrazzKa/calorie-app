import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [AssetsService],
  controllers: [AssetsController],
  exports: [AssetsService],
})
export class AssetsModule {}
