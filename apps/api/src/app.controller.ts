import { Controller, Get } from '@nestjs/common';

@Controller() // ← без 'v1'
export class AppController {
  @Get() // GET /v1
  index() {
    return { ok: true };
  }

  @Get('health') // GET /v1/health
  health() {
    return { ok: true };
  }
}
