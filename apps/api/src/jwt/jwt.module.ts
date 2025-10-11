import { Global, Module, OnModuleInit } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { JwksController } from './jwks.controller';

@Global()
@Module({
  providers: [JwtService],
  controllers: [JwksController],
  exports: [JwtService],
})
export class JwtModule implements OnModuleInit {
  constructor(private readonly jwt: JwtService) {}
  async onModuleInit() { await this.jwt.onModuleInit(); }
}
