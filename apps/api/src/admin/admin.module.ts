import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma.module';
import { JwtModule } from '../jwt/jwt.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, JwtModule, RedisModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

