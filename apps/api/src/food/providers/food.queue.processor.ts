import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { FOOD_QUEUE } from '../tokens';
import { FoodService } from '../food.service';

type JobData = {
  userId: string;
  mealId: string;
  file: { mime?: string; base64: string };
};

@Processor(FOOD_QUEUE)
export class FoodQueueProcessor {
  constructor(private readonly food: FoodService) {}

  @Process({ concurrency: 2 })
  async handle(job: Job<JobData>) {
    try {
      const { userId, mealId, file } = job.data;
      const buffer = Buffer.from(file.base64, 'base64');
      await this.food.analyzeIntoExistingMeal({
        userId,
        mealId,
        buffer,
        mime: file.mime,
        methodBadge: 'analyzer',
        allowCache: true,
      });
    } catch (e) {
      const attempts = (job.attemptsMade ?? 0) + 1;
      if (attempts < 3) throw e;
      await this.food.markMealFailed(job.data.mealId);
    }
  }
}
