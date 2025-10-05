import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { createReadStream } from 'node:fs';

@Injectable()
export class AssetsService {
  private readonly baseDir: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const dir = this.cfg.get<string>('ASSETS_DIR') || path.resolve(process.cwd(), 'var', 'assets');
    this.baseDir = path.resolve(dir);
  }

  private async ensureDir(dir: string) {
    await fsp.mkdir(dir, { recursive: true });
  }

  private safeJoin(key: string) {
    const full = path.resolve(this.baseDir, key);
    if (!full.startsWith(this.baseDir + path.sep)) {
      throw new NotFoundException();
    }
    return full;
  }

  private pickExt(filename?: string, mime?: string) {
    if (filename && filename.includes('.')) return filename.split('.').pop()!;
    if (mime?.startsWith('image/')) return mime.split('/').pop()!;
    return 'bin';
  }

  async saveBuffer(args: { userId: string; buffer: Buffer; mime?: string; filename?: string }) {
    const { userId, buffer, mime, filename } = args;
    const ext = this.pickExt(filename, mime);
    const key = `local/${crypto.randomUUID().replace(/-/g, '')}.${ext}`;
    const full = this.safeJoin(key);

    await this.ensureDir(path.dirname(full));
    await fsp.writeFile(full, buffer);

    // Сохраняем минимальный набор полей (совместимо со схемой без доп. метаданных)
    const asset = await this.prisma.mediaAsset.create({
      data: {
        ownerId: userId,
        s3Key: key,
        mime: mime ?? 'application/octet-stream',
      },
      select: { id: true, s3Key: true, mime: true },
    });

    return asset;
  }

  async openForRead(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { id: true, s3Key: true, mime: true },
    });
    if (!asset) throw new NotFoundException();

    const full = this.safeJoin(asset.s3Key);
    try {
      const stat = await fsp.stat(full);
      const stream = createReadStream(full);
      return {
        stream,
        mime: asset.mime || 'application/octet-stream',
        size: stat.size,                 // берём из файловой системы
        etag: undefined as string | undefined, // ETag опционален
        filename: path.basename(asset.s3Key),
      };
    } catch {
      throw new NotFoundException();
    }
  }
}
