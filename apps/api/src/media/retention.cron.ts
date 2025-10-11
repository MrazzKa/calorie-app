import { Injectable, Logger } from '@nestjs/common';
// TODO: If using scheduled jobs, install @nestjs/schedule and enable ScheduleModule in AppModule.
// import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaService } from './media.service';

@Injectable()
export class MediaRetentionCron {
  private readonly logger = new Logger(MediaRetentionCron.name);

  constructor(private readonly media: MediaService) {}

  // TODO: Uncomment when @nestjs/schedule is available and ScheduleModule is configured
  // @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailyCleanup(): Promise<void> {
    try {
      const result = await this.media.cleanupOldMedia();
      this.logger.log(`Media retention cleanup: ${result.deleted} deleted, ${result.errors} errors`);
    } catch (e) {
      this.logger.error('Media retention cleanup failed', e as Error);
    }
  }
}


