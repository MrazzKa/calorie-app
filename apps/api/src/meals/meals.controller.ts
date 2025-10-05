import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  PaymentRequiredException,
  NotFoundException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { MealsService } from './meals.service';
import { AccessGuard } from '../auth/guards/access.guard';
import { CurrentUser } from '../auth/guards/access.guard';
import { ConfigService } from '@nestjs/config';

class CreateMealDto {
  @IsString()
  @IsNotEmpty()
  assetId!: string;
}

class AdjustMealDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsNumber()
  @Min(-1000)
  gramsDelta!: number;
}

@Controller('meals')
@UseGuards(AccessGuard)
export class MealsController {
  constructor(
    private readonly mealsService: MealsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMeal(
    @Body() body: CreateMealDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const analyzeMode = this.configService.get<string>('ANALYZE_MODE') || 'async';
    
    if (user.role === 'free') {
      const dailyCount = await this.mealsService.getDailyPhotoCount(user.sub);
      const limit = this.configService.get<number>('FREE_DAILY_PHOTO_LIMIT') || 5;
      
      if (dailyCount >= limit) {
        throw new PaymentRequiredException({
          code: 'limit_exceeded',
          message: `Daily photo limit of ${limit} exceeded`,
          dailyCount,
          limit,
        });
      }
    }

    const meal = await this.mealsService.createMeal(user.sub, body.assetId);

    if (analyzeMode === 'sync') {
      // Run analysis synchronously
      const result = await this.mealsService.analyzeMeal(meal.id);
      return {
        ...meal,
        analysis: result,
      };
    } else {
      // Enqueue for async analysis
      await this.mealsService.enqueueAnalysis(meal.id);
      return {
        ...meal,
        status: 'pending',
        message: 'Analysis queued',
      };
    }
  }

  @Get(':id')
  async getMeal(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const meal = await this.mealsService.getMealById(id, userId);
    
    if (!meal) {
      throw new NotFoundException(`Meal ${id} not found`);
    }

    return meal;
  }

  @Patch(':id/adjust')
  async adjustMeal(
    @Param('id') id: string,
    @Body() body: AdjustMealDto,
    @CurrentUser('sub') userId: string,
  ) {
    const result = await this.mealsService.adjustMealItem(
      id,
      body.itemId,
      body.gramsDelta,
      userId,
    );

    if (!result) {
      throw new NotFoundException(`Meal ${id} or item ${body.itemId} not found`);
    }

    return result;
  }
}
