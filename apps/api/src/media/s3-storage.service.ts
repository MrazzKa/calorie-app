import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import type { IStorage } from './storage.interface';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class S3StorageService implements IStorage {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET')!;
    this.region = this.configService.get<string>('S3_REGION') || 'us-east-1';
    
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const usePathStyle = this.configService.get<string>('S3_FORCE_PATH_STYLE') === 'true';
    
    this.s3Client = new S3Client({
      endpoint: endpoint || undefined,
      region: this.region,
      forcePathStyle: usePathStyle,
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('S3_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
      });
      
      await this.s3Client.send(command);
      this.logger.debug(`Saved object to S3: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to save object to S3: ${key}`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      this.logger.debug(`Deleted object from S3: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete object from S3: ${key}`, error);
      throw error;
    }
  }

  async stat(key: string): Promise<{ size: number; mtime: Date }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      const response = await this.s3Client.send(command);
      return {
        size: response.ContentLength || 0,
        mtime: response.LastModified || new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to stat object from S3: ${key}`, error);
      throw error;
    }
  }

  createReadStream(key: string): NodeJS.ReadableStream {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    return this.s3Client.send(command).then(response => {
      return response.Body as Readable;
    }).catch(error => {
      this.logger.error(`Failed to create read stream from S3: ${key}`, error);
      throw error;
    }) as any;
  }

  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
    maxSizeBytes?: number,
  ): Promise<string> {
    try {
      const commandInput: any = {
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      };

      // Add content length restriction if specified
      if (maxSizeBytes !== undefined) {
        commandInput.ContentLength = maxSizeBytes;
      }

      const command = new PutObjectCommand(commandInput);
      
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      this.logger.debug(`Generated presigned upload URL for: ${key} (max size: ${maxSizeBytes || 'unlimited'} bytes)`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned upload URL for: ${key}`, error);
      throw error;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      const response = await this.s3Client.send(command);
      const body = response.Body;
      let buf: Buffer;
      
      if (body && typeof (body as any).pipe === 'function') {
        buf = await streamToBuffer(body as any);
      } else if (body instanceof Uint8Array) {
        buf = Buffer.from(body);
      } else {
        throw new Error('Unsupported S3 Body type');
      }
      
      return buf;
    } catch (error) {
      this.logger.error(`Failed to get object buffer from S3: ${key}`, error);
      throw error;
    }
  }
}
