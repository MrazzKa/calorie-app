import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { JwtModule } from '../../jwt/jwt.module';
import { WeightsService } from './weights.service';
import { WeightsController } from './weights.controller';

@Module({
  imports: [PrismaModule, JwtModule],
  controllers: [WeightsController],
  providers: [WeightsService],
})
export class WeightsModule {}


