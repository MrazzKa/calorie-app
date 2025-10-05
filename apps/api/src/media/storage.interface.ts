export interface IStorage {
  save(key: string, buffer: Buffer): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  stat(key: string): Promise<{ size: number; mtime: Date }>;
  createReadStream(key: string): NodeJS.ReadableStream;
}
