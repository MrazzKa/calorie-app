import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { JwtModule } from '../../jwt/jwt.module';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';

@Module({
  imports: [PrismaModule, JwtModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}


