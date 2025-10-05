import { Controller, Get } from '@nestjs/common';
import { JwtService } from './jwt.service';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwt: JwtService) {}
  @Get('jwks.json')
  get() {
    return this.jwt.getJWKS();
  }
}
