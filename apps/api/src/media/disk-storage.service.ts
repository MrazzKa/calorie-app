import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { IStorage } from './storage.interface';

function safeJoin(root: string, key: string) {
  const clean = key.replace(/^\/*/, ''); // убираем лидирующие слеши
  const p = path.resolve(root, clean);
  if (!p.startsWith(path.resolve(root))) throw new Error('path_traversal');
  return p;
}

@Injectable()
export class DiskStorageService implements IStorage {
  private root: string;

  constructor() {
    // по умолчанию ./var/media от корня проекта
    const def = path.resolve(process.cwd(), 'var', 'media');
    this.root = process.env.MEDIA_DISK_ROOT || def;
  }

  private async ensureDir(p: string) {
    await fsp.mkdir(path.dirname(p), { recursive: true });
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    const full = safeJoin(this.root, key);
    await this.ensureDir(full);
    await fsp.writeFile(full, buffer);
  }

  async exists(key: string): Promise<boolean> {
    const full = safeJoin(this.root, key);
    try {
      await fsp.access(full, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const full = safeJoin(this.root, key);
    try {
      await fsp.unlink(full);
    } catch {
      /* ignore */
    }
  }

  async stat(key: string): Promise<{ size: number; mtime: Date }> {
    const full = safeJoin(this.root, key);
    const s = await fsp.stat(full);
    return { size: s.size, mtime: s.mtime };
  }

  createReadStream(key: string): NodeJS.ReadableStream {
    const full = safeJoin(this.root, key);
    return fs.createReadStream(full);
  }
}
