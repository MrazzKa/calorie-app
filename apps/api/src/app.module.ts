import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma.module';
import { MailerModule } from './mailer/mailer.module';
import { RedisModule } from './redis/redis.module';
import { JwtModule } from './jwt/jwt.module';
import { WellKnownModule } from './well-known/well-known.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FoodModule } from './food/food.module';

import { StatsController } from './stats/stats.controller';

import { MediaModule } from './media/media.module';

import { AssetsModule } from './assets/assets.module';

import { AppBullModule } from './queues/bull.module';
import { WeightsModule } from './users/weights/weights.module';
import { GoalsModule } from './users/goals/goals.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
    }),
    PrismaModule,
    MailerModule,
    RedisModule.forRoot(),
    JwtModule,
    WellKnownModule,
    AppBullModule,
    AuthModule,
    UsersModule,
    FoodModule,
    MediaModule,
    AssetsModule,
    WeightsModule,
    GoalsModule,
    AdminModule,
  ],
  controllers: [AppController, StatsController],
  providers: [AppService],
})
export class AppModule {}
