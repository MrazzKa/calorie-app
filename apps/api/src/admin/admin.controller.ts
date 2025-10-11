import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

class UpdateUserRoleDto {
  @IsString()
  @IsNotEmpty()
  role!: string;

  @IsOptional()
  @IsDateString()
  planExpiresAt?: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin only)' })
  async listUsers(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const takeNum = take ? parseInt(take, 10) : undefined;
    const skipNum = skip ? parseInt(skip, 10) : undefined;

    if (takeNum !== undefined && (!Number.isFinite(takeNum) || takeNum < 1)) {
      throw new BadRequestException('invalid_take');
    }
    if (skipNum !== undefined && (!Number.isFinite(skipNum) || skipNum < 0)) {
      throw new BadRequestException('invalid_skip');
    }

    return this.admin.listUsers({ take: takeNum, skip: skipNum });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details (admin only)' })
  async getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user role (admin only)' })
  async updateUserRole(
    @Param('id') id: string,
    @Body() body: UpdateUserRoleDto,
  ) {
    const planExpiresAt = body.planExpiresAt ? new Date(body.planExpiresAt) : undefined;

    const updated = await this.admin.updateUserRole({
      userId: id,
      role: body.role,
      planExpiresAt,
    });

    return {
      ok: true,
      user: updated,
    };
  }
}

