import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InferenceClient {
  constructor(private readonly config: ConfigService) {}

  async analyzeImage(buffer: Buffer, mime?: string): Promise<any> {
    const url = (this.config.get<string>('WORKER_URL') || 'http://localhost:8000').replace(/\/$/, '') + '/analyze';
    const key = this.config.get<string>('WORKER_KEY') || '';
    const controller = new AbortController();
    const timeoutMs = Number(this.config.get('WORKER_TIMEOUT_MS') || 12000);
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const form = new FormData();
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const blob = new Blob([ab], { type: mime || 'application/octet-stream' });
    form.append('file', blob, 'image');

    const doFetch = async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Worker-Key': key,
        } as any,
        body: form as any,
        signal: controller.signal,
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const status = r.status;
        const err: any = new Error(`worker_error_${status}`);
        err.status = status;
        err.body = t;
        throw err;
      }
      return r.json();
    };

    try {
      return await doFetch();
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET') {
        // one retry
        try { return await doFetch(); } catch (e2) { throw e2; }
      }
      throw e;
    } finally {
      clearTimeout(to);
    }
  }
}


