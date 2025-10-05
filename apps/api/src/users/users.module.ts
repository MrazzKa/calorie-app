import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtService } from '../jwt/jwt.service';
import { SessionsService } from '../sessions/sessions.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, JwtService, SessionsService],
  exports: [UsersService],
})
export class UsersModule {}
