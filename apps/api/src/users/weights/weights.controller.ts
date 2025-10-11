import { BadRequestException, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Body } from '@nestjs/common';
import { JwtService } from '../../jwt/jwt.service';
import { WeightsService } from './weights.service';

@Controller('weights')
export class WeightsController {
  constructor(private readonly jwt: JwtService, private readonly weights: WeightsService) {}

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

  @Get()
  async list(@Headers('authorization') authz?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('take') take?: string) {
    const sub = await this.extractSub(authz);
    return this.weights.list(sub, from, to, take ? Number(take) : undefined);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upsert(@Headers('authorization') authz?: string, @Body() body?: { date: string; weightKg: number }) {
    const sub = await this.extractSub(authz);
    return this.weights.upsert(sub, body?.date as any, Number(body?.weightKg));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Headers('authorization') authz?: string, @Param('id') id?: string) {
    const sub = await this.extractSub(authz);
    await this.weights.remove(sub, id!);
  }
}


