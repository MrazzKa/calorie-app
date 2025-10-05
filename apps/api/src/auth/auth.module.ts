import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionsService } from '../sessions/sessions.service';
import { JwtService } from '../jwt/jwt.service';
import { RateLimitService } from '../common/rate-limit.service';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [AuthService, OtpService, SessionsService, JwtService, RateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
