import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WellKnownController } from './well-known.controller';

@Module({
  imports: [ConfigModule],      // ← добавлено
  controllers: [WellKnownController],
})
export class WellKnownModule {}
