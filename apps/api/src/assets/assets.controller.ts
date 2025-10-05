import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    try {
      const { stream, mime, size, etag, filename } = await this.assets.openForRead(id);
      res.setHeader('Content-Type', mime);
      if (size != null) res.setHeader('Content-Length', String(size));
      if (etag) res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      stream.pipe(res);
    } catch {
      throw new NotFoundException();
    }
  }
}
