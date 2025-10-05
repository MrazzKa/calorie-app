import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { FoodService } from './food.service';

@Processor(process.env.FOOD_QUEUE || 'food:analyze')
export class FoodProcessor {
  constructor(private readonly food: FoodService) {}

  @Process()
  async handle(job: Job<{ userId: string; mealId: string; file: { mime?: string; buffer: Buffer } }>) {
    const { userId, mealId, file } = job.data;
    await this.food.analyzeIntoExistingMeal({
      mealId, userId, buffer: Buffer.from(file.buffer), mime: file.mime, methodBadge: 'ai', allowCache: true,
    });
  }
}
