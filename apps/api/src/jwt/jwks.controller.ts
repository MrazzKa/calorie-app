import { Controller, Get, HttpCode } from '@nestjs/common';
import { JwtService } from './jwt.service';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwt: JwtService) {}
  
  @Get('jwks.json')
  @HttpCode(200)
  get() {
    return this.jwt.getJWKS();
  }
}
