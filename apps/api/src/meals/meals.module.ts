import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';
import { PrismaModule } from '../prisma.module';
import { MediaModule } from '../media/media.module';
import { RateLimitService } from '../common/rate-limit.service';
import { JwtModule } from '../jwt/jwt.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MediaModule,
    JwtModule,
    BullModule.registerQueue({
      name: 'food:analyze',
    }),
  ],
  controllers: [MealsController],
  providers: [MealsService, RateLimitService],
  exports: [MealsService],
})
export class MealsModule {}
