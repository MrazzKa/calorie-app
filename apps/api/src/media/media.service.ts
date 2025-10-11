import { Injectable, BadRequestException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { STORAGE } from './tokens';
import type { IStorage } from './storage.interface';
import { S3StorageService } from './s3-storage.service';
import { createHash } from 'crypto';
import { createId } from '@paralleldrive/cuid2';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
];

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: IStorage,
    private readonly s3Storage: S3StorageService,
  ) {}

  async generatePresignedUploadUrl(
    userId: string,
    contentType: string,
    correlationId?: string,
  ): Promise<{ uploadUrl: string; assetId: string }> {
    this.logger.log(`Generating presigned upload URL for user ${userId}`, { correlationId });

    // Validate content type FIRST (always check this)
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      throw new BadRequestException({
        code: 'invalid_content_type',
        message: `Content type ${contentType} not allowed. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        correlationId,
      });
    }

    // Check if uploads are disabled (for testing) - return mock immediately
    const disableUploads = process.env.DISABLE_UPLOADS === 'true';
    if (disableUploads) {
      // Even in mock mode we create a MediaAsset so the rest of the flow works
      const assetId = createId();
      const uploadUrl = `mock://upload/${assetId}`;
      await this.prisma.mediaAsset.create({
        data: { id: assetId, ownerId: userId, s3Key: `mock/${assetId}`, mime: contentType },
      });
      this.logger.log(`Using mock upload URL for asset ${assetId} (DISABLE_UPLOADS=true)`, { correlationId });
      return { uploadUrl, assetId };
    }

    // Strict S3 configuration check - fail fast if not configured
    const s3Bucket = this.configService.get<string>('S3_BUCKET');
    const s3Access = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const s3Secret = this.configService.get<string>('S3_SECRET_ACCESS_KEY');
    if (!s3Bucket || !s3Access || !s3Secret) {
      const missing: string[] = [];
      if (!s3Bucket) missing.push('S3_BUCKET');
      if (!s3Access) missing.push('S3_ACCESS_KEY_ID');
      if (!s3Secret) missing.push('S3_SECRET_ACCESS_KEY');
      
      this.logger.error(`S3 configuration incomplete. Missing: ${missing.join(', ')}`, { correlationId });
      throw new BadRequestException({
        code: 's3_not_configured',
        message: `S3 storage is not configured. Missing environment variables: ${missing.join(', ')}`,
        correlationId,
      });
    }

    // Generate unique asset ID and S3 key with date structure
    const assetId = createId();
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    
    // Generate SHA256 hash from assetId for uniqueness (we don't have file content yet)
    const hashId = createHash('sha256').update(assetId).digest('hex');
    
    // Determine file extension from content type
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/gif': 'gif',
    };
    const ext = extMap[contentType] || 'bin';
    
    // Format: u/{userId}/{yyyy}/{mm}/{dd}/{sha256}.{ext}
    const s3Key = `u/${userId}/${yyyy}/${mm}/${dd}/${hashId}.${ext}`;

    // Generate real presigned upload URL with 10MB size limit
    const uploadUrl = await this.s3Storage.generatePresignedUploadUrl(
      s3Key,
      contentType,
      3600, // 1 hour expiry
      10 * 1024 * 1024, // 10MB limit
    );

    // Create MediaAsset record
    await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        ownerId: userId,
        s3Key,
        mime: contentType,
      },
    });

    this.logger.log(`Created presigned upload URL for asset ${assetId} at ${s3Key}`, { correlationId });

    return {
      uploadUrl,
      assetId,
    };
  }

  async getAssetBuffer(assetId: string, userId: string): Promise<Buffer> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        ownerId: userId,
      },
    });

    if (!asset) {
      throw new BadRequestException(`Asset ${assetId} not found`);
    }

    return this.s3Storage.getObjectBuffer(asset.s3Key);
  }

  async updateAssetMetadata(
    assetId: string,
    metadata: {
      size?: number;
      width?: number;
      height?: number;
      sha256?: string;
    },
  ): Promise<void> {
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: metadata,
    });
  }

  async calculateImageHash(buffer: Buffer): Promise<string> {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async cleanupOldMedia(): Promise<{ deleted: number; errors: number }> {
    const retentionDays = this.configService.get<number>('RAW_MEDIA_RETENTION_DAYS') || 14;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    this.logger.log(`Cleaning up media older than ${cutoffDate.toISOString()}`);

    const oldAssets = await this.prisma.mediaAsset.findMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        meals: {
          some: {
            status: {
              in: ['ready', 'failed'],
            },
          },
        },
      },
      include: {
        meals: true,
      },
    });

    let deleted = 0;
    let errors = 0;

    for (const asset of oldAssets) {
      try {
        // Check if asset is still needed for any active meals
        const hasActiveMeals = asset.meals.some(
          meal => meal.status === 'pending' || meal.status === 'processing'
        );

        if (hasActiveMeals) {
          continue;
        }

        // Delete from S3
        await this.s3Storage.delete(asset.s3Key);

        // Delete from database
        await this.prisma.mediaAsset.delete({
          where: { id: asset.id },
        });

        deleted++;
        this.logger.debug(`Deleted old media asset: ${asset.id}`);
      } catch (error) {
        errors++;
        this.logger.error(`Failed to delete old media asset ${asset.id}:`, error);
      }
    }

    this.logger.log(`Media cleanup completed: ${deleted} deleted, ${errors} errors`);
    return { deleted, errors };
  }
}
