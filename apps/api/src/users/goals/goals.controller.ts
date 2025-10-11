import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JwtService } from '../../jwt/jwt.service';
import { GoalsService } from './goals.service';

@Controller('goals')
export class GoalsController {
  constructor(private readonly jwt: JwtService, private readonly goals: GoalsService) {}

  private async extractSub(authz?: string): Promise<string> {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    
    try {
      const payload = await this.jwt.verifyAccess(token);
      if (payload?.sub) return String(payload.sub);
    } catch (error) {
      throw new BadRequestException('invalid_access');
    }
    
    throw new BadRequestException('invalid_access');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async set(
    @Headers('authorization') authz?: string,
    @Body() body?: { targetWeightKg: number; targetDate: string; activity?: 'sedentary'|'light'|'moderate'|'active'|'very_active' },
  ) {
    const sub = await this.extractSub(authz);
    return this.goals.setGoal(sub, Number(body?.targetWeightKg), String(body?.targetDate), (body?.activity || 'moderate') as any);
  }

  @Get('plan')
  async plan(@Headers('authorization') authz?: string) {
    const sub = await this.extractSub(authz);
    return this.goals.getPlan(sub);
  }
}


