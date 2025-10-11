import { 
  Controller, 
  Get, 
  Post, 
  Header, 
  NotFoundException, 
  Req, 
  Res, 
  Body, 
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { STORAGE } from './tokens';
import type { IStorage } from './storage.interface';
import { MediaService } from './media.service';
import { AccessGuard } from '../auth/guards/access.guard';
import { CurrentUser } from '../auth/guards/access.guard';
import { IsString, IsNotEmpty } from 'class-validator';
import * as path from 'node:path';

function guessMimeByExt(key: string): string {
  const ext = path.extname(key).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.heic':
      return 'image/heic';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

class PresignDto {
  @IsString()
  @IsNotEmpty()
  contentType!: string;
}

@Controller('media')
export class MediaController {
  constructor(
    @Inject(STORAGE) private readonly storage: IStorage,
    private readonly mediaService: MediaService,
  ) {}

  @Post('presign')
  @UseGuards(AccessGuard)
  async presign(
    @Body() body: PresignDto,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    const correlationId = (req as any).correlationId;
    return this.mediaService.generatePresignedUploadUrl(
      userId,
      body.contentType,
      correlationId,
    );
  }

  // Important trick: wildcard for keys with slashes (local/<uuid>.ext)
  @Get('*path')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async serve(@Req() req: Request, @Res() res: Response) {
    // Express puts wildcard in named param
    const key = decodeURIComponent(((req.params as any).path || '')).replace(/^\//, '');
    if (!key) throw new NotFoundException();

    if (!(await this.storage.exists(key))) throw new NotFoundException();

    const { size, mtime } = await this.storage.stat(key);
    res.setHeader('Content-Type', guessMimeByExt(key));
    res.setHeader('Content-Length', String(size));
    res.setHeader('Last-Modified', mtime.toUTCString());

    const stream = this.storage.createReadStream(key);
    stream.pipe(res);
  }
}
