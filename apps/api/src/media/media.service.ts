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

    // Validate content type
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      throw new BadRequestException({
        code: 'invalid_content_type',
        message: `Content type ${contentType} not allowed. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        correlationId,
      });
    }

    // Generate unique asset ID and S3 key
    const assetId = createId();
    const s3Key = `u/${userId}/${assetId}.bin`;

    // Generate presigned upload URL
    const uploadUrl = await this.s3Storage.generatePresignedUploadUrl(
      s3Key,
      contentType,
      3600, // 1 hour expiry
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

    this.logger.log(`Created presigned upload URL for asset ${assetId}`, { correlationId });

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
