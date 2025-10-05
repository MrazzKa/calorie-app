import { Global, Module } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { JwksController } from './jwks.controller';

@Global()
@Module({
  providers: [JwtService],
  controllers: [JwksController],
  exports: [JwtService],
})
export class JwtModule {}
