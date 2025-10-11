import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3StorageService } from './s3-storage.service';
import { STORAGE } from './tokens';
import { DiskStorageService } from './disk-storage.service';
import { PrismaModule } from '../prisma.module';
import { JwtModule } from '../jwt/jwt.module';
import { MediaRetentionCron } from './retention.cron';

@Module({
  imports: [ConfigModule, PrismaModule, JwtModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    S3StorageService,
    DiskStorageService,
    MediaRetentionCron,
    {
      provide: STORAGE,
      // Switch storage driver based on environment variable
      useFactory: (cfg: ConfigService, disk: DiskStorageService, s3: S3StorageService) => {
        const driver = (cfg.get<string>('MEDIA_STORAGE') || 's3').toLowerCase();
        if (driver === 's3') {
          return s3;
        }
        return disk;
      },
      inject: [ConfigService, DiskStorageService, S3StorageService],
    },
  ],
  exports: [STORAGE, MediaService],
})
export class MediaModule {}
