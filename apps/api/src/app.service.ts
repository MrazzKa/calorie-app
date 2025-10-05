import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return { ok: true };
  }
  root() {
    return { name: 'CalorieCam API', status: 'ok' };
  }
}
